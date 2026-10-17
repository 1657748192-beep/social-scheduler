import assert from 'node:assert/strict';
import test from 'node:test';
import Redis from 'ioredis';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
import {createFacebookPageSyncStore} from '../src/facebookPageSync/store';
import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
const page=(id:string)=>({pageId:id,name:'New '+id,avatarUrl:null,profileUrl:'https://www.facebook.com/'+id,pageToken:'new-secret-'+id,scopes:['pages_manage_posts','pages_read_engagement'],expiresAt:null});
async function fixture(run:(f:any)=>Promise<void>){
 const mod=await import('../src/facebookPageSync/service').catch(()=>null);assert.ok(mod,'additive import service must exist');
 await withFacebookManagementFixture(async f=>{
  const env=require('../../../scripts/run-tests.cjs').environment(true,true),redis=new Redis(env.LOCAL_UPLOAD_TEST_REDIS_URL),store=createFacebookPageSyncStore({redis,encrypt:encryptToken,decrypt:decryptToken}),ids:string[]=[];
  const ctx=f.contexts[0],graph:any={authorizationUrl:(state:string)=>'https://www.facebook.com/authorize?state='+state,discover:async()=>({providerUserId:'900',pages:['100','101','102'].map(page),rejected:[]}),revalidate:async(p:any)=>p};
  const make=(overrides:any={})=>mod.createFacebookPageSyncService({db:f.db,store,graph,encrypt:encryptToken,...overrides});
  const prepare=async(service=make())=>{const start=await service.start(ctx),state=new URL(start.authorizationUrl).searchParams.get('state')!;const result=await service.callback({state,code:'synthetic-code'});ids.push(result.syncId);return{service,id:result.syncId};};
  const oldIds=f.accounts.map((a:any)=>a.id),snapshot=async()=>({accounts:await f.db.socialAccount.findMany({where:{id:{in:oldIds}},include:{credential:true},orderBy:{id:'asc'}}),schedules:await f.db.schedule.findMany({where:{workspaceId:{in:f.workspaceIds}},include:{publishJobs:true},orderBy:{id:'asc'}}),management:await f.db.facebookManagementConnection.findMany({where:{workspaceId:{in:f.workspaceIds}},include:{pages:true},orderBy:{id:'asc'}})});
  try{await run({...f,ctx,store,graph,make,prepare,snapshot});}finally{for(const id of ids)await redis.del('facebook-page-sync:v1:sync:'+id);redis.disconnect();}
 });
}
test('candidate callback writes no accounts, and selected-only import preserves old records including disconnected credentials',async()=>fixture(async(f:any)=>{
 await f.db.socialAccount.update({where:{id:f.accounts[0].id},data:{status:'disconnected'}});
 const post=await f.db.post.create({data:{workspaceId:f.ctx.workspaceId,authorId:f.userId,baseText:'old schedule',variants:{create:{platform:'facebook',socialAccountId:f.accounts[0].id,text:'old'}}},include:{variants:true}});
 await f.db.schedule.create({data:{workspaceId:f.ctx.workspaceId,postVariantId:post.variants[0].id,createdBy:f.userId,scheduledAt:new Date(Date.now()+86400000)}});
 const before=await f.snapshot(),{service,id}=await f.prepare();assert.deepEqual(await f.snapshot(),before);
 const view=await service.view(f.ctx,id);assert.equal(view.pages.find((p:any)=>p.pageId==='100').existing,true);assert.doesNotMatch(JSON.stringify(view),/new-secret|pageToken|scopes/);
 await assert.rejects(service.confirm(f.ctx,id,['999']));assert.deepEqual(await f.snapshot(),before);
 const result=await service.confirm(f.ctx,id,['101']);assert.deepEqual(result,{createdPageIds:['101'],skippedPageIds:[]});
 assert.equal(await f.db.socialAccount.count({where:{workspaceId:f.ctx.workspaceId,providerAccountId:'102'}}),0);assert.deepEqual(await f.snapshot(),before);
 assert.deepEqual(await service.confirm(f.ctx,id,['101']),result);await assert.rejects(service.confirm(f.ctx,id,['102']));
}));
test('two concurrent syncs and preexisting normal binding never overwrite winning page credentials',async()=>fixture(async(f:any)=>{
 const before=await f.snapshot(),a=await f.prepare(),b=await f.prepare();const results=await Promise.all([a.service.confirm(f.ctx,a.id,['101']),b.service.confirm(f.ctx,b.id,['101'])]);
 assert.equal(results.reduce((n:any,r:any)=>n+r.createdPageIds.length,0),1);assert.equal(await f.db.socialAccount.count({where:{workspaceId:f.ctx.workspaceId,providerAccountId:'101'}}),1);
 const winner=await f.db.socialAccount.findFirst({where:{workspaceId:f.ctx.workspaceId,providerAccountId:'101'},include:{credential:true}});
 const c=await f.prepare();assert.deepEqual(await c.service.confirm(f.ctx,c.id,['101']),{createdPageIds:[],skippedPageIds:['101']});
 assert.deepEqual(await f.db.socialAccount.findUnique({where:{id:winner.id},include:{credential:true}}),winner);assert.deepEqual(await f.snapshot(),before);
}));
test('lost database acknowledgement and Redis finish failure are safe to retry without credential replacement',async()=>fixture(async(f:any)=>{
 let lost=true,finishLost=true;
 const db=new Proxy(f.db,{get(target,key){if(key==='$transaction')return async(run:any,opts:any)=>{const value=await target.$transaction(run,opts);if(lost){lost=false;throw Error('COMMIT acknowledgement lost');}return value;};return Reflect.get(target,key);}});
 const store={...f.store,finish:async(...args:any[])=>{if(finishLost){finishLost=false;throw Error('Redis disconnected');}return f.store.finish(...args);}};
 const service=f.make({db,store}),before=await f.snapshot(),{id}=await f.prepare(service);
 await assert.rejects(service.confirm(f.ctx,id,['101']));assert.deepEqual((await service.view(f.ctx,id)).selectedPageIds,['101']);const first=await f.db.socialAccount.findFirst({where:{workspaceId:f.ctx.workspaceId,providerAccountId:'101'},include:{credential:true}});assert.ok(first);
 await assert.rejects(service.confirm(f.ctx,id,['101']));assert.deepEqual(await service.confirm(f.ctx,id,['101']),{createdPageIds:['101'],skippedPageIds:[]});
 assert.deepEqual(await f.db.socialAccount.findUnique({where:{id:first.id},include:{credential:true}}),first);assert.deepEqual(await f.snapshot(),before);
}));
test('transaction failure rolls back all new pages and manager demotion during revalidation prevents creation',async()=>fixture(async(f:any)=>{
 const db=new Proxy(f.db,{get(target,key){if(key==='$transaction')return (run:any,opts:any)=>target.$transaction((tx:any)=>run(new Proxy(tx,{get(t,k){if(k==='socialAccount')return new Proxy(t.socialAccount,{get(account,op){if(op==='create')return async(args:any)=>{if(args.data.providerAccountId==='102')throw Error('Injected DB failure');return account.create(args);};return Reflect.get(account,op);}});return Reflect.get(t,k);}})),opts);return Reflect.get(target,key);}});
 const {service,id}=await f.prepare(f.make({db})),before=await f.snapshot();await assert.rejects(service.confirm(f.ctx,id,['101','102']));assert.equal(await f.db.socialAccount.count({where:{workspaceId:f.ctx.workspaceId,providerAccountId:{in:['101','102']}}}),0);assert.deepEqual(await f.snapshot(),before);
 const graph={...f.graph,revalidate:async(p:any)=>{await f.db.workspaceMember.updateMany({where:{workspaceId:f.ctx.workspaceId,userId:f.userId},data:{role:'viewer'}});return p;}};
 const next=await f.prepare(f.make({graph}));await assert.rejects(next.service.confirm(f.ctx,next.id,['101']));assert.equal(await f.db.socialAccount.count({where:{workspaceId:f.ctx.workspaceId,providerAccountId:'101'}}),0);
}));
