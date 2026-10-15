import assert from 'node:assert/strict';
import test from 'node:test';
import {queryTikTokProfile} from '../src/integrations/social/tiktokProfile';
import {createSandboxMetricsService} from '../src/services/tiktokSandboxMetricsService';
import {encryptToken} from '../src/utils/tokenCrypto';

test('profile read requests only needed fields and verifies identity before returning an official link',async()=>{
  const result=await queryTikTokProfile('sandbox-secret','sandbox-open',async(input,init)=>{
    assert.equal(String(input),'https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,profile_deep_link');
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer sandbox-secret');
    assert.equal(init?.redirect,'error');
    return Response.json({error:{code:'ok'},data:{user:{open_id:'sandbox-open',username:'andypeng97',profile_deep_link:'https://www.tiktok.com/@andypeng97'}}});
  });
  assert.equal(result.status,'ok');
  if(result.status==='ok') {assert.equal(result.profileUrl,'https://www.tiktok.com/@andypeng97'); assert.equal(result.username,'andypeng97');}
});
test('incorrect identity, unsafe links and conflicting usernames cannot be exposed',async()=>{
  for(const user of [
    {open_id:'wrong',username:'andypeng97',profile_deep_link:'https://www.tiktok.com/@andypeng97'},
    {open_id:'sandbox-open',username:'andypeng97',profile_deep_link:'https://evil.test/@andypeng97'},
    {open_id:'sandbox-open',username:'andypeng97',profile_deep_link:'https://www.tiktok.com/@someoneelse'},
    {open_id:'sandbox-open',username:'andypeng97',profile_deep_link:'https://www.tiktok.com/@andypeng97?access_token=secret'}
  ]) assert.equal((await queryTikTokProfile('secret','sandbox-open',async()=>Response.json({error:{code:'ok'},data:{user}}))).status,'data_unavailable');
});

test('official profile short links normalize to the verified API username without following redirects',async()=>{
  let calls=0;
  const result=await queryTikTokProfile('sandbox-secret','sandbox-open',async()=>{
    calls++;
    return Response.json({error:{code:'ok'},data:{user:{open_id:'sandbox-open',username:'andypeng97',profile_deep_link:'https://www.tiktok.com/t/ZReview123/'}}});
  });
  assert.equal(result.status,'ok');
  if(result.status==='ok') assert.equal(result.profileUrl,'https://www.tiktok.com/@andypeng97');
  assert.equal(calls,1);
});

test('short link support cannot bypass identity, host, path or secret URL checks',async()=>{
  for(const [openId,username,link] of [
    ['wrong','andypeng97','https://www.tiktok.com/t/ZReview123/'],
    ['sandbox-open','','https://www.tiktok.com/t/ZReview123/'],
    ['sandbox-open','andypeng97','https://evil.test/t/ZReview123/'],
    ['sandbox-open','andypeng97','https://www.tiktok.com/t/'],
    ['sandbox-open','andypeng97','https://www.tiktok.com/t/ZReview123/extra'],
    ['sandbox-open','andypeng97','https://www.tiktok.com/t/ZReview123/?access_token=secret'],
    ['sandbox-open','andypeng97','https://www.tiktok.com/t/ZReview123/#secret'],
    ['sandbox-open','andypeng97','https://secret@www.tiktok.com/t/ZReview123/']
  ]) {
    const result=await queryTikTokProfile('secret','sandbox-open',async()=>Response.json({error:{code:'ok'},data:{user:{open_id:openId,username,profile_deep_link:link}}}));
    assert.equal(result.status,'data_unavailable');
  }
});
test('profile permission and session errors are safe states without leaking provider payloads',async()=>{
  for(const [httpStatus,code,want] of [[403,'scope_not_authorized','permission_missing'],[401,'access_token_invalid','authorization_required'],[500,'server_error','temporarily_unavailable']] as const) {
    assert.deepEqual(await queryTikTokProfile('secret','sandbox-open',async()=>Response.json({error:{code,message:'secret'}},{status:httpStatus})),{status:want});
  }
});

test('old sandbox grants keep statistics but cannot fetch profile; the profile uses only sandbox tokens',async()=>{
  let calls=0;
  const row={id:'row',userId:'u',workspaceId:'w',clientKey:'sandbox',scopes:['user.info.basic','video.list','user.info.stats'],expiresAt:new Date(Date.now()+3600000),accessTokenEncrypted:encryptToken('sandbox-only'),openId:'sandbox-open'};
  const db:any={workspaceMember:{findUnique:async()=>({status:'active',role:'owner'})},socialAccount:{findFirst:async()=>({id:'a',providerAccountId:'production-open',credential:{accessTokenEncrypted:encryptToken('production-secret')}})},$executeRaw:async()=>{},tikTokSandboxCredential:{findUnique:async()=>row}};
  db.$transaction=async(fn:any)=>fn(db);
  const settings={enabled:true,allowedUserId:'u',allowedWorkspaceId:'w',allowedAccountId:'a',clientId:'sandbox',clientSecret:'secret',redirectUri:'https://example.test/callback'};
  const service=createSandboxMetricsService({db,settings,api:{} as any},async(_input,init)=>{
    calls++; assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer sandbox-only');
    return Response.json({error:{code:'ok'},data:{user:{open_id:'sandbox-open',username:'andypeng97',profile_deep_link:'https://www.tiktok.com/@andypeng97',follower_count:1,following_count:2,likes_count:3,video_count:4}}});
  });
  assert.equal((await service.stats('u','w')).status,'ok');
  calls=0; assert.equal((await service.profile('u','w')).status,'permission_missing'); assert.equal(calls,0);
  row.scopes.push('user.info.profile');
  assert.equal((await service.profile('u','w')).status,'ok'); assert.equal(calls,1);
  await assert.rejects(service.profile('other','w')); assert.equal(calls,1);
});
