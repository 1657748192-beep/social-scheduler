import assert from 'node:assert/strict';
import test from 'node:test';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
import {createSocialAccountProfileService} from '../src/services/socialAccountAvatarService';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {startFacebookManagementHttp} from './helpers/facebookManagementHttp';

const now=new Date('2026-10-17T08:00:00Z');
const photo='https://yt3.ggpht.com/new-avatar.jpg';
function setup(f:any,fetcher:typeof fetch,clock=()=>now){
  return createSocialAccountProfileService({db:f.db,fetch:fetcher,now:clock,decrypt:()=> 'test-access-token'});
}
async function account(f:any,platform='facebook',extra:any={}){
  return f.db.socialAccount.update({where:{id:f.accounts[0].id},data:{platform,providerAccountId:platform==='youtube'?'UCabcdefghijklmnopqrstuv':'100',displayName:'Old name',avatarUrl:'https://example.test/old.jpg',capabilities:{oauth2:true,profileUsername:'old',unrelated:{keep:true}},...extra}});
}
const failure=(code:number)=>(error:any)=>error.statusCode===code&&!/test-access-token/.test(JSON.stringify(error));

test('refresh uses each official endpoint and identity, saves name/avatar only and leaves publishing state intact',async()=>withFacebookManagementFixture(async(f:any)=>{
  const post=await f.db.post.create({data:{workspaceId:f.workspaceIds[0],authorId:f.userId,baseText:'Original',variants:{create:{platform:'facebook',socialAccountId:f.accounts[0].id,text:'Original'}}},include:{variants:true}});
  const schedule=await f.db.schedule.create({data:{workspaceId:f.workspaceIds[0],postVariantId:post.variants[0].id,createdBy:f.userId,scheduledAt:new Date('2027-01-01T00:00:00Z'),status:'scheduled'}});
  await f.db.publishJob.create({data:{workspaceId:f.workspaceIds[0],postVariantId:post.variants[0].id,scheduleId:schedule.id,status:'waiting',idempotencyKey:randomUUID()}});
  const publishing=()=>f.db.schedule.findMany({where:{workspaceId:f.workspaceIds[0]},include:{publishJobs:true,postVariant:true}});
  const originalPublishing=await publishing();
  const cases=[
    ['facebook',{id:'100',name:'New Page',picture:{data:{url:photo}}},'graph.facebook.com','/100','New Page'],
    ['youtube',{items:[{id:'UCabcdefghijklmnopqrstuv',snippet:{title:'New Channel',thumbnails:{medium:{url:photo}}}}]},'www.googleapis.com','/youtube/v3/channels','New Channel'],
    ['instagram',{id:'app-scoped-id',user_id:'100',name:'New IG Name',username:'new_ig',profile_picture_url:photo},'graph.instagram.com','/me','New IG Name'],
    ['tiktok',{data:{user:{open_id:'100',display_name:'New TikTok',avatar_url:photo}},error:{code:'ok'}},'open.tiktokapis.com','/v2/user/info/','New TikTok'],
    ['pinterest',{id:'100',business_name:'New Pinterest',username:'new_pin',profile_image:photo},'api.pinterest.com','/v5/user_account','New Pinterest']
  ] as const;
  for(const [platform,payload,host,path,name] of cases){
    const a=await account(f,platform);
    const credentialQuery={where:{socialAccountId:{in:f.accounts.map((row:any)=>row.id)}},orderBy:{id:'asc' as const}};
    const before=await f.db.oauthCredential.findMany(credentialQuery);
    const service=setup(f,(async(raw,init)=>{
      const url=new URL(String(raw));assert.equal(url.hostname,host);assert.ok(url.pathname.endsWith(path));
      assert.equal(new Headers(init?.headers).get('authorization'),'Bearer test-access-token');
      assert.equal(url.searchParams.has('access_token'),false);assert.equal(init?.redirect,'error');assert.ok(init?.signal);
      if(platform==='youtube'){assert.equal(url.searchParams.get('id'),a.providerAccountId);assert.equal(url.searchParams.has('mine'),false);}
      return Response.json(payload);
    }) as typeof fetch);
    const result=await service.refresh(f.userId,a.workspaceId,a.id,'manual');
    assert.equal(result.status,'updated');assert.equal(result.displayName,name);assert.equal(result.avatarUrl,photo);
    const saved=await f.db.socialAccount.findUniqueOrThrow({where:{id:a.id}});
    assert.equal(saved.id,a.id);assert.equal(saved.providerAccountId,a.providerAccountId);assert.equal(saved.status,a.status);
    assert.deepEqual(saved.capabilities.unrelated,{keep:true});assert.equal(saved.capabilities.oauth2,true);
    assert.equal(saved.capabilities.profileSync.lastSuccessAt,now.toISOString());
    assert.deepEqual(await f.db.oauthCredential.findMany(credentialQuery),before);
    assert.deepEqual(await publishing(),originalPublishing);
    assert.doesNotMatch(JSON.stringify(result),/test-access-token|accessTokenEncrypted|refreshToken/);
    if(platform==='instagram')assert.equal(result.profileUrl,'https://www.instagram.com/new_ig/');
  }
}));

test('HTTP refresh requires authentication and manager access and rejects injected parameters',async()=>withFacebookManagementFixture(async(f:any)=>{
  const a=await account(f),http=await startFacebookManagementHttp();
  try{
    const session=await f.db.userSession.findUniqueOrThrow({where:{id:f.sessionId}});
    const token=jwt.sign({sub:f.userId,email:`${f.userId}@example.test`,sid:f.sessionId,jti:session.tokenId},'facebook-management-http-test-only');
    const url=`${http.origin}/api/v1/workspaces/${a.workspaceId}/social-accounts/${a.id}/refresh-profile`;
    assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
    const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
    assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({mode:'auto',endpoint:'https://evil.test',accessToken:'injected'})})).status,400);
    await f.db.workspaceMember.updateMany({where:{workspaceId:a.workspaceId},data:{role:'viewer'}});
    const before=await f.snapshot();
    assert.equal((await fetch(url,{method:'POST',headers,body:'{"mode":"auto"}'})).status,403);
    assert.deepEqual(await f.snapshot(),before);
  }finally{await http.stop();}
}));

test('refresh denies viewer, wrong workspace, disconnected and expired credentials without a provider request',async()=>withFacebookManagementFixture(async(f:any)=>{
  const a=await account(f);let reads=0;const service=setup(f,(async()=>{reads++;throw Error('Must not fetch');}) as typeof fetch);
  await f.db.workspaceMember.updateMany({where:{workspaceId:a.workspaceId},data:{role:'viewer'}});
  await assert.rejects(()=>service.refresh(f.userId,a.workspaceId,a.id,'manual'),failure(403));
  await f.db.workspaceMember.updateMany({where:{workspaceId:a.workspaceId},data:{role:'owner'}});
  await assert.rejects(()=>service.refresh(f.userId,f.workspaceIds[1],a.id,'manual'),failure(404));
  await f.db.socialAccount.update({where:{id:a.id},data:{status:'disconnected'}});
  await assert.rejects(()=>service.refresh(f.userId,a.workspaceId,a.id,'manual'),failure(409));
  await f.db.socialAccount.update({where:{id:a.id},data:{status:'active'}});
  await f.db.oauthCredential.update({where:{socialAccountId:a.id},data:{expiresAt:new Date(now.getTime()-1)}});
  const before=await f.snapshot();
  await assert.rejects(()=>service.refresh(f.userId,a.workspaceId,a.id,'manual'),failure(409));
  assert.deepEqual(await f.snapshot(),before);assert.equal(reads,0);
}));

test('auto cooldown is enforced across requests including failures, while explicit manual refresh can retry later',async()=>withFacebookManagementFixture(async(f:any)=>{
  const a=await account(f);let reads=0,time=now.getTime(),fail=true;
  const service=setup(f,(async()=>{reads++;return fail?Response.json({error:{message:'test-access-token'}},{status:429}):Response.json({id:'100',name:'Recovered',picture:{data:{url:photo}}});}) as typeof fetch,()=>new Date(time));
  await assert.rejects(()=>service.refresh(f.userId,a.workspaceId,a.id,'auto'),failure(502));
  assert.equal((await service.refresh(f.userId,a.workspaceId,a.id,'auto')).status,'skipped');
  assert.equal(reads,1);fail=false;time+=61_000;
  assert.equal((await service.refresh(f.userId,a.workspaceId,a.id,'manual')).displayName,'Recovered');
  assert.equal((await service.refresh(f.userId,a.workspaceId,a.id,'manual')).status,'skipped');
  time+=86_400_000;
  assert.equal((await service.refresh(f.userId,a.workspaceId,a.id,'auto')).status,'updated');assert.equal(reads,3);
}));

test('provider errors identity mismatch and unsafe/missing avatars preserve the previous identity and image',async()=>withFacebookManagementFixture(async(f:any)=>{
  const inputs=[{id:'wrong',name:'Other user',picture:{data:{url:photo}}},{error:{message:'test-access-token'}},{id:'100',name:'New',picture:{data:{url:'javascript:alert(1)'}}},{id:'100',name:'New'},{id:'100',name:' ',picture:{data:{url:photo}}}];
  for(const payload of inputs){
    const a=await account(f);const service=setup(f,(async()=>Response.json(payload)) as typeof fetch);
    await assert.rejects(()=>service.refresh(f.userId,a.workspaceId,a.id,'manual'),failure(502));
    const saved=await f.db.socialAccount.findUnique({where:{id:a.id}});assert.equal(saved.displayName,'Old name');assert.equal(saved.avatarUrl,a.avatarUrl);assert.equal(saved.status,'active');
  }
  const a=await account(f);const service=setup(f,(async()=>{throw new DOMException('test-access-token','TimeoutError');}) as typeof fetch);
  await assert.rejects(()=>service.refresh(f.userId,a.workspaceId,a.id,'manual'),failure(502));
}));

test('concurrent refreshes issue one provider read and an in-flight credential rotation cannot overwrite profile',async()=>withFacebookManagementFixture(async(f:any)=>{
  const a=await account(f);let finish!:()=>void,reads=0;
  const service=setup(f,(async()=>{reads++;await new Promise<void>(r=>{finish=r;});return Response.json({id:'100',name:'New',picture:{data:{url:photo}}});}) as typeof fetch);
  const first=service.refresh(f.userId,a.workspaceId,a.id,'auto');
  while(!finish)await new Promise(r=>setTimeout(r,5));
  assert.equal((await service.refresh(f.userId,a.workspaceId,a.id,'auto')).status,'skipped');assert.equal(reads,1);
  await f.db.oauthCredential.update({where:{socialAccountId:a.id},data:{accessTokenEncrypted:'rotated-do-not-replace'}});
  finish();await assert.rejects(()=>first,failure(409));
  const saved=await f.db.socialAccount.findUnique({where:{id:a.id},include:{credential:true}});
  assert.equal(saved.displayName,'Old name');assert.equal(saved.credential.accessTokenEncrypted,'rotated-do-not-replace');
}));
