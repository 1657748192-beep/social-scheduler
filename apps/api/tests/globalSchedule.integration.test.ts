import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {fork} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {baselineBundle} from '@social-scheduler/timezone-rules';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Queue} from 'bullmq';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';

test('real scheduling HTTP persists selected zones and protects old instants, credentials, access and queued jobs',()=>withFacebookManagementFixture(async f=>{
 const env=require('../../../scripts/run-tests.cjs').environment(true,true),key='global-schedule-local-test-key';
 const redisUrl=new URL(env.LOCAL_UPLOAD_TEST_REDIS_URL);
 const queue=new Queue('publish',{connection:{host:redisUrl.hostname,port:Number(redisUrl.port),maxRetriesPerRequest:1}});
 const workspaceId=f.workspaceIds[0], protectedWorkspaceId=f.workspaceIds[1];
 const second=await f.db.socialAccount.create({data:{workspaceId,platform:'facebook',providerAccountId:'101',displayName:'Second test page',accountType:'page',credential:{create:{accessTokenEncrypted:'synthetic-preserved',scopes:['pages_manage_posts']}}}});
 const protectedPost=await f.db.post.create({data:{workspaceId:protectedWorkspaceId,authorId:f.userId,baseText:'protected',variants:{create:{socialAccountId:f.accounts[1].id,platform:'facebook',text:'protected'}}},include:{variants:true}});
 const protectedVariant=protectedPost.variants[0];
 const protectedSchedule=await f.db.schedule.create({data:{postVariantId:protectedVariant.id,workspaceId:protectedWorkspaceId,createdBy:f.userId,scheduledAt:new Date('2099-01-01T12:00:27.123Z'),timezone:'America/New_York'}});
 const oldJob=await f.db.publishJob.create({data:{scheduleId:protectedSchedule.id,postVariantId:protectedVariant.id,workspaceId:protectedWorkspaceId,status:'waiting',idempotencyKey:randomUUID()}});
 await queue.add('publish-post',{publishJobId:oldJob.id},{jobId:oldJob.id,delay:86400000});
 const snapshot=async()=>({accounts:await f.snapshot(),users:await f.db.user.findMany({where:{id:f.userId}}),members:await f.db.workspaceMember.findMany({where:{workspaceId:{in:f.workspaceIds},userId:f.userId},orderBy:{id:'asc'}}),posts:await f.db.post.findMany({where:{id:protectedPost.id},include:{variants:{include:{schedules:{include:{publishJobs:true}}}}}}),queue:await(await queue.client).hgetall(queue.toKey(oldJob.id)),queueState:await queue.getJobState(oldJob.id)});
 const before=await snapshot();
 const child=fork(path.resolve('apps/api/tests/fixtures/globalScheduleHttp.ts'),[],{execArgv:['--import',pathToFileURL(require.resolve('tsx')).href],stdio:['ignore','ignore','ignore','ipc'],env:{...env,DATABASE_URL:env.FACEBOOK_TEST_DATABASE_URL,REDIS_URL:env.LOCAL_UPLOAD_TEST_REDIS_URL,JWT_SECRET:key,FACEBOOK_MANAGEMENT_ENABLED:'false',INSTAGRAM_MANAGEMENT_ENABLED:'false'}});
 let failure:unknown;
 try{
  const port=await new Promise<number>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('HTTP fixture timed out')),20000);child.once('message',(m:any)=>{clearTimeout(timer);resolve(m.port);});child.once('exit',()=>{clearTimeout(timer);reject(Error('HTTP fixture exited'));});});
  const session=await f.db.userSession.findUniqueOrThrow({where:{id:f.sessionId}});
  const headers={'content-type':'application/json',authorization:'Bearer '+jwt.sign({sub:f.userId,email:'local@example.test',sid:f.sessionId,jti:session.tokenId},key,{expiresIn:'1h'})};
  const base=`http://127.0.0.1:${port}/api/v1/workspaces/${workspaceId}`;
  const call=(route:string,method='GET',body?:unknown)=>fetch(base+route,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  const input={baseText:'local test only',scheduledAt:'2099-10-21T00:00:00.000Z',variants:[f.accounts[0],second].map(a=>({socialAccountId:a.id,platform:'facebook',text:'local test only',mediaAssetIds:[],platformPayload:{}}))};
  // Simulate instance B holding a cached old directory while instance A has activated a new alias.
  const rulesKey='timezone-rules:v1:active',rulesRedis=await queue.client,previousRules=await rulesRedis.get(rulesKey);
  await fetch(`http://127.0.0.1:${port}/api/v1/timezone-rules/manifest`,{headers});
  try{
   const b=structuredClone(baselineBundle);b.tzdbVersion=b.data.version='2026f';b.data.links.push('Asia/Shanghai|Test/New_Page_Zone');const raw=Buffer.from(JSON.stringify(b.data));b.sourceBytes=raw.toString('base64');b.sha256=createHash('sha256').update(raw).digest('hex');
   await rulesRedis.set(rulesKey,JSON.stringify(b));
   const aliasResponse=await call('/composer/posts','POST',{...input,timezone:'Test/New_Page_Zone'});assert.equal(aliasResponse.status,201);
   const aliasPost:any=await aliasResponse.json();assert.equal(aliasPost.variants[0].schedules[0].timezone,'Test/New_Page_Zone');assert.equal(aliasPost.variants[0].schedules[0].scheduledAt,input.scheduledAt);
  }finally{if(previousRules===null)await rulesRedis.del(rulesKey);else await rulesRedis.set(rulesKey,previousRules);}
  const created=await call('/composer/posts','POST',{...input,timezone:'America/New_York'});assert.equal(created.status,201);
  const post:any=await created.json();
  for(const variant of post.variants){assert.equal(variant.schedules[0].scheduledAt,input.scheduledAt);assert.equal(variant.schedules[0].timezone,'America/New_York');}
  const scheduleId=post.variants[0].schedules[0].id;
  assert.equal((await call(`/schedules/${scheduleId}`,'PATCH',{scheduledAt:'2099-10-22T00:00:27.123Z',text:'explicit edit'})).status,200);
  const stored=await f.db.schedule.findUniqueOrThrow({where:{id:scheduleId}});assert.equal(stored.timezone,'America/New_York');assert.equal(stored.scheduledAt.toISOString(),'2099-10-22T00:00:27.123Z');
  const legacy=await call('/composer/posts','POST',input);assert.equal(legacy.status,201);assert.equal((await legacy.json() as any).variants[0].schedules[0].timezone,'Asia/Shanghai');
  const draftResponse=await call('/composer/posts','POST',{...input,scheduledAt:undefined});assert.equal(draftResponse.status,201);
  const draft:any=await draftResponse.json();assert.equal(draft.variants[0].schedules.length,0);
  const standard=await call('/schedules','POST',{postVariantId:draft.variants[0].id,scheduledAt:input.scheduledAt,timezone:'Asia/Kathmandu'});assert.equal(standard.status,201);
  const standardBody:any=await standard.json();assert.equal(standardBody.schedule.timezone,'Asia/Kathmandu');assert.equal(standardBody.schedule.scheduledAt,input.scheduledAt);
  assert.equal((await call(`/schedules/${scheduleId}`,'PATCH',{scheduledAt:'2099-10-23T00:00:00.000Z',timezone:'CST'})).status,400);
  assert.equal((await f.db.schedule.findUniqueOrThrow({where:{id:scheduleId}})).scheduledAt.toISOString(),'2099-10-22T00:00:27.123Z');
  for(const timezone of ['CST','UTC+8','Unknown/Zone','x'.repeat(81)])assert.equal((await call('/composer/posts','POST',{...input,timezone})).status,400);
  assert.equal((await call('/composer/posts','POST',{...input,scheduledAt:'2000-01-01T00:00:00.000Z'})).status,400);
  for(const role of ['viewer','expired']){
   const other=await f.db.user.create({data:{id:randomUUID(),email:randomUUID()+'@example.test',name:role,passwordHash:'synthetic',...(role==='expired'?{publishingAccessExpiresAt:new Date('2000-01-01')}:{})}});
   try{
    await f.db.workspaceMember.create({data:{workspaceId,userId:other.id,role:role==='viewer'?'viewer':'owner',status:'active'}});
    const s=await f.db.userSession.create({data:{userId:other.id,tokenId:randomUUID(),expiresAt:new Date(Date.now()+86400000)}});
    const auth=jwt.sign({sub:other.id,email:other.email,sid:s.id,jti:s.tokenId},key,{expiresIn:'1h'});
    const count=await f.db.schedule.count({where:{workspaceId}});
    assert.equal((await fetch(base+'/composer/posts',{method:'POST',headers:{...headers,authorization:'Bearer '+auth},body:JSON.stringify(input)})).status,403);
    assert.equal(await f.db.schedule.count({where:{workspaceId}}),count);
   }finally{await f.db.user.delete({where:{id:other.id}});}
  }
  // Test-only completion simulation: no provider call, no Worker, no actual published content.
  await f.db.schedule.update({where:{id:scheduleId},data:{status:'published'}});
  await f.db.publishJob.updateMany({where:{scheduleId},data:{status:'succeeded'}});
  const published:any=await (await call('/published-posts')).json();assert.equal(published.find((p:any)=>p.id===scheduleId).timezone,'America/New_York');
  // Full component → authenticated HTTP → Prisma → BullMQ contract, with only the transport origin remapped.
  const React=await import('react'),{act}=await import('react-test-renderer');
  const {ComposerForm}=await import('../../web/components/composer/ComposerForm');
  const {ScheduleDetailPanel}=await import('../../web/components/calendar/ScheduleDetailPanel');
  const {withFacebookUI,facebookButton,facebookText}=await import('../../web/tests/helpers/facebookManagementUI');
  const networkFetch=globalThis.fetch, softwareToken=headers.authorization.slice(7), text='global-e2e-'+randomUUID();
  const transport=(url:URL,init?:RequestInit)=>{
    assert.equal(url.hostname,'localhost');assert.equal(url.port,'4000');
    return networkFetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`,init);
  };
  await withFacebookUI(React.createElement(ComposerForm,{token:softwareToken,workspaces:[{id:workspaceId,name:'Local isolated workspace',role:'owner'} as any]}),async({view,requests}:any)=>{
    await act(async()=>view.root.findByProps({className:'composer-textarea compact'}).props.onChange({target:{value:text}}));
    await act(async()=>facebookButton(view,'定时发布').props.onClick());
    const zone=view.root.findByProps({'aria-label':'发布地区与时区'});
    await act(async()=>zone.props.onFocus());await act(async()=>zone.props.onChange({target:{value:'America/Winnipeg'}}));
    await act(async()=>zone.props.onKeyDown({key:'ArrowDown',preventDefault(){}}));await act(async()=>zone.props.onKeyDown({key:'Enter',preventDefault(){}}));
    await act(async()=>view.root.findByProps({'aria-label':'当地日期'}).props.onChange({target:{value:'2099-11-05'}}));
    await act(async()=>view.root.findByProps({'aria-label':'当地小时'}).props.onChange({target:{value:'20'}}));
    assert.ok(facebookText(view).includes('2099-11-06 09:00'));
    await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
    assert.equal(requests.find((r:any)=>r.method==='POST').body.scheduledAt,'2099-11-06T01:00:00.000Z');
  },transport);
  const e2e=await f.db.post.findFirstOrThrow({where:{workspaceId,baseText:text},include:{variants:{include:{schedules:{include:{publishJobs:true}}}}}});
  assert.equal(e2e.variants.length,2);for(const v of e2e.variants){assert.equal(v.schedules[0].timezone,'America/Winnipeg');assert.equal(v.schedules[0].scheduledAt.toISOString(),'2099-11-06T01:00:00.000Z');const queued=await queue.getJob(v.schedules[0].publishJobs[0].id);assert.ok(queued);assert.ok(Math.abs(queued.timestamp+queued.delay-v.schedules[0].scheduledAt.getTime())<5000,'queue wake-up must match canonical UTC within enqueue latency');}
  const e2eScheduleId=e2e.variants[0].schedules[0].id, original=await f.db.schedule.findUniqueOrThrow({where:{id:e2eScheduleId}});
  const detail:any=await(await call('/schedules/'+e2eScheduleId)).json();
  await withFacebookUI(React.createElement(ScheduleDetailPanel,{schedule:detail,token:softwareToken,workspaceId,onClose(){},onDeleted(){},onUpdated(){}}),async({view,requests}:any)=>{
    const zone=view.root.findByProps({'aria-label':'发布地区与时区'});await act(async()=>zone.props.onFocus());await act(async()=>zone.props.onChange({target:{value:'Asia/Tokyo'}}));await act(async()=>zone.props.onKeyDown({key:'ArrowDown',preventDefault(){}}));await act(async()=>zone.props.onKeyDown({key:'Enter',preventDefault(){}}));
    await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
    assert.equal(requests.filter((r:any)=>r.method==='PATCH').length,0);assert.deepEqual(await f.db.schedule.findUniqueOrThrow({where:{id:e2eScheduleId}}),original);
    await act(async()=>view.root.findByProps({'aria-label':'当地日期'}).props.onChange({target:{value:'2099-10-22'}}));
    await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  },transport);
  const rescheduled=await f.db.schedule.findUniqueOrThrow({where:{id:e2eScheduleId}});assert.equal(rescheduled.timezone,'Asia/Tokyo');assert.equal(rescheduled.scheduledAt.toISOString(),'2099-10-22T01:00:00.000Z');
  assert.deepEqual(await snapshot(),before);
 }catch(error){failure=error;}finally{
  if(child.connected)child.send('stop');
  await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},3000);child.once('exit',()=>{clearTimeout(timer);resolve();});});
  const jobs=await f.db.publishJob.findMany({where:{workspaceId:{in:f.workspaceIds}},select:{id:true}});
  for(const job of jobs)await (await queue.getJob(job.id))?.remove();
  await queue.close();
 }
 if(failure)throw failure;
}));
