import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {createFacebookManagementStore} from '../src/facebookManagement/store';
import {createFacebookManagementOAuth} from '../src/facebookManagement/oauth';

async function fixture(run:(f:any)=>Promise<void>){
  const url=process.env.FACEBOOK_TEST_DATABASE_URL;
  assert.ok(url,'Independent test database is required');
  assert.match(new URL(url).pathname,/_test$/);assert.notEqual(url,process.env.DATABASE_URL);
  const db=new PrismaClient({datasources:{db:{url}}});
  const userId=randomUUID(),workspaceId=randomUUID(),sessionId=randomUUID(),accountId=randomUUID();
  const ctx={userId,workspaceId,sessionId};
  try{
    await db.user.create({data:{id:userId,email:`${userId}@example.test`,name:'Management test',passwordHash:'not-real'}});
    await db.workspace.create({data:{id:workspaceId,ownerId:userId,name:'Test',slug:workspaceId}});
    await db.workspaceMember.create({data:{userId,workspaceId,role:'owner',status:'active'}});
    await db.userSession.create({data:{id:sessionId,userId,tokenId:randomUUID(),expiresAt:new Date(Date.now()+86400000)}});
    await db.socialAccount.create({data:{id:accountId,workspaceId,platform:'facebook',providerAccountId:'100',displayName:'Original',accountType:'page',credential:{create:{accessTokenEncrypted:'original-publishing-encrypted',scopes:['pages_manage_posts'],tokenType:'Bearer',expiresAt:new Date('2030-01-01')}}}});
    const post=await db.post.create({data:{workspaceId,authorId:userId,baseText:'Original scheduled post',variants:{create:{platform:'facebook',text:'Original',socialAccountId:accountId}}},include:{variants:true}});
    await db.schedule.create({data:{postVariantId:post.variants[0].id,workspaceId,scheduledAt:new Date('2030-01-01'),createdBy:userId}});
    const snapshot=async()=>({account:await db.socialAccount.findUnique({where:{id:accountId},include:{credential:true}}),posts:await db.post.findMany({where:{workspaceId},include:{variants:{include:{schedules:true}}}})});
    const store=createFacebookManagementStore(db,value=>`sealed:${value}`);
    const grant={appId:'123',providerUserId:'200',userToken:'new-user-secret',scopes:['pages_show_list','business_management'],expiresAt:null,pages:[{pageId:'100',name:'Managed',pageToken:'new-page-secret',tasks:['MESSAGING'],scopes:['pages_messaging'],expiresAt:null,profileUrl:'https://www.facebook.com/100',avatarUrl:null}]};
    const options={store,config:{enabled:true,appId:'123',graphVersion:'v26.0',loginConfigId:'456',callbackUrl:'https://example.test/api/v1/integrations/facebook-management/oauth/callback'},exchange:async()=>grant};
    await run({db,ctx,store,grant,snapshot,options});
  }finally{await db.workspace.deleteMany({where:{id:workspaceId,ownerId:userId}});await db.user.deleteMany({where:{id:userId}});await db.$disconnect();}
}

test('grantDoesNotTouchPublishingSnapshot',async()=>fixture(async({db,ctx,store,snapshot,options}:any)=>{
  const before=await snapshot(),oauth=createFacebookManagementOAuth(options);
  const started=await oauth.start(ctx),url=new URL(started.authorizationUrl);
  assert.equal(url.origin,'https://www.facebook.com');assert.equal(url.searchParams.get('config_id'),'456');
  assert.equal(url.searchParams.get('redirect_uri'),options.config.callbackUrl);
  assert.equal(url.searchParams.has('access_token'),false);
  const state=url.searchParams.get('state')!;
  const result=await oauth.callback({state,code:'test-code'});
  assert.ok(result.connectionId);
  const saved=await store.findConnection(ctx,result.connectionId);
  assert.equal(saved.userTokenEncrypted,'sealed:new-user-secret');
  assert.equal(saved.appId,'123');
  assert.equal(saved.pages[0].pageTokenEncrypted,'sealed:new-page-secret');
  await assert.rejects(oauth.callback({state,code:'replay'}));
  for(const exchange of [async()=>{throw Error('provider secret');},async()=>null]){
    const flow=createFacebookManagementOAuth({...options,exchange});
    const next=new URL((await flow.start(ctx)).authorizationUrl).searchParams.get('state')!;
    await assert.rejects(flow.callback({state:next,code:'bad'}),error=>!String(error).includes('provider secret'));
  }
  const canceled=new URL((await oauth.start(ctx)).authorizationUrl).searchParams.get('state')!;
  await assert.rejects(oauth.callback({state:canceled,code:''}));
  await assert.rejects(oauth.callback({state:canceled,code:'later'}));
  assert.deepEqual(await snapshot(),before);
  assert.equal(await db.facebookManagementConnection.count({where:{workspaceId:ctx.workspaceId,status:'active'}}),1);
}));

test('expiredSessionRemovedManagerAndConcurrentCallbacksCannotSave',async()=>fixture(async({db,ctx,store,grant,options}:any)=>{
  const oauth=createFacebookManagementOAuth(options);
  async function pending(){return new URL((await oauth.start(ctx)).authorizationUrl).searchParams.get('state')!;}
  const expired=await pending();
  await db.facebookManagementOAuthState.updateMany({where:{state:expired},data:{expiresAt:new Date(0)}});
  await assert.rejects(oauth.callback({state:expired,code:'code'}));
  const removed=await pending();
  await db.workspaceMember.updateMany({where:{userId:ctx.userId,workspaceId:ctx.workspaceId},data:{role:'viewer'}});
  await assert.rejects(oauth.callback({state:removed,code:'code'}));
  await db.workspaceMember.updateMany({where:{userId:ctx.userId,workspaceId:ctx.workspaceId},data:{role:'owner'}});
  const deadSession=await pending();
  await db.userSession.update({where:{id:ctx.sessionId},data:{expiresAt:new Date(0)}});
  await assert.rejects(oauth.callback({state:deadSession,code:'code'}));
  await db.userSession.update({where:{id:ctx.sessionId},data:{expiresAt:new Date(Date.now()+86400000)}});
  const legacySession=await pending();
  await db.userSession.update({where:{id:ctx.sessionId},data:{createdAt:new Date(Date.now()-25*3600000)}});
  await assert.rejects(oauth.callback({state:legacySession,code:'code'}));
  await db.userSession.update({where:{id:ctx.sessionId},data:{createdAt:new Date()}});
  const state=await pending();
  const results=await Promise.allSettled([oauth.callback({state,code:'a'}),oauth.callback({state,code:'b'})]);
  assert.equal(results.filter((r:any)=>r.status==='fulfilled').length,1);
  const id=results.find((r:any)=>r.status==='fulfilled').value.connectionId;
  const first=await pendingReconnect(),second=await pendingReconnect();
  async function pendingReconnect(){return new URL((await oauth.start(ctx,id)).authorizationUrl).searchParams.get('state')!;}
  const consumed=await store.consumeState(first),other=await store.consumeState(second);
  assert.ok(consumed);assert.ok(other);
  assert.ok(await store.saveGrant(consumed,grant));
  assert.equal(await store.saveGrant(other,grant),null);
}));

test('disconnectOneConnectionDoesNotRevokeAppOrOtherConnection',async()=>fixture(async({db,ctx,store,snapshot,options}:any)=>{
  let providerRevokeCalls=0;
  const oauth=createFacebookManagementOAuth({...options,revoke:async()=>{providerRevokeCalls++;}}),before=await snapshot();
  async function connect(){const state=new URL((await oauth.start(ctx)).authorizationUrl).searchParams.get('state')!;return (await oauth.callback({state,code:'code'})).connectionId;}
  const a=await connect(),b=await connect();
  await store.disconnect(ctx,a);
  const disconnected=await store.findConnection(ctx,a),active=await store.findConnection(ctx,b);
  assert.equal(disconnected.status,'disconnected');assert.equal(disconnected.userTokenEncrypted,null);
  assert.ok(disconnected.pages.every((p:any)=>p.pageTokenEncrypted===null&&!p.active));
  assert.equal(active.status,'active');assert.equal(active.userTokenEncrypted,'sealed:new-user-secret');
  assert.equal(providerRevokeCalls,0);assert.deepEqual(await snapshot(),before);
  await assert.rejects(store.disconnect({...ctx,workspaceId:randomUUID()},b));
  await db.workspace.delete({where:{id:ctx.workspaceId}});
  assert.equal(await db.facebookManagementConnection.count({where:{id:{in:[a,b]}}}),0);
}));
