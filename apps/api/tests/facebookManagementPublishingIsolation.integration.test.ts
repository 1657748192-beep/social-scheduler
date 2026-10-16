import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
import {startFacebookManagementHttp} from './helpers/facebookManagementHttp';
import {createFacebookManagementStore} from '../src/facebookManagement/store';
import {createFacebookPageAccess} from '../src/facebookManagement/access';
import {createFacebookManagementOAuth} from '../src/facebookManagement/oauth';
import {createFacebookDirectoryService} from '../src/facebookManagement/directory';
import {createFacebookManagementEngagement} from '../src/facebookManagement/engagement';
import {createFacebookSendExecutor} from '../src/facebookManagement/sendAttempts';
import {createFacebookSubscriptionService} from '../src/facebookManagement/subscriptions';
import {createFacebookManagementReceptionStore} from '../src/facebookManagement/receptionStore';
import {FacebookEngagementError} from '../src/integrations/social/facebookEngagement';

test('fullManagementLifecycleLeavesPublishingExactlyUnchanged',async()=>withFacebookManagementFixture(async(f:any)=>{
  const {db}=f,workspaceId=f.workspaceIds[0];
  const post=await db.post.create({data:{workspaceId,authorId:f.userId,baseText:'Original',variants:{create:{platform:'facebook',socialAccountId:f.accounts[0].id,text:'Original',publishStatus:'published'}}},include:{variants:true}});
  const schedule=await db.schedule.create({data:{workspaceId,postVariantId:post.variants[0].id,createdBy:f.userId,scheduledAt:new Date(),status:'published'}});
  await db.publishJob.create({data:{workspaceId,postVariantId:post.variants[0].id,scheduleId:schedule.id,status:'succeeded',idempotencyKey:randomUUID(),providerPostId:'100_1',rawResponse:{id:'100_1'}}});
  const queued=await db.schedule.create({data:{workspaceId,postVariantId:post.variants[0].id,createdBy:f.userId,scheduledAt:new Date(Date.now()+86400000),status:'scheduled'}});
  await db.publishJob.create({data:{workspaceId,postVariantId:post.variants[0].id,scheduleId:queued.id,status:'waiting',idempotencyKey:randomUUID()}});
  const snapshot=async()=>({accounts:await f.snapshot(),posts:await db.post.findMany({where:{workspaceId},include:{variants:true},orderBy:{id:'asc'}}),schedules:await db.schedule.findMany({where:{workspaceId},include:{publishJobs:{orderBy:{id:'asc'}}},orderBy:{id:'asc'}})});
  const before=await snapshot(),store=createFacebookManagementStore(db,v=>`sealed:${v}`);
  const grant={appId:'123',providerUserId:'200',userToken:'management-only',scopes:f.scopes,expiresAt:null,pages:[{pageId:'100',name:'New directory name',pageToken:'management-page',tasks:['MANAGE','MESSAGING','MODERATE'],scopes:f.scopes,expiresAt:null,profileUrl:'https://www.facebook.com/100',avatarUrl:null}]};
  const oauth=createFacebookManagementOAuth({store,config:{enabled:true,appId:'123',graphVersion:'v26.0',loginConfigId:'456',callbackUrl:'https://example.test/callback'},exchange:async()=>grant});
  const state=new URL((await oauth.start(f.contexts[0])).authorizationUrl).searchParams.get('state')!;
  const {connectionId}=await oauth.callback({state,code:'test-code-not-real'});
  const page=await db.facebookManagedPage.findUniqueOrThrow({where:{connectionId_pageId:{connectionId,pageId:'100'}}});
  const ctx={...f.contexts[0],managedPageId:page.id};
  const inspect=async(id:string)=>({pageId:id,scopes:f.scopes,granularScopes:[],expiresAt:null});
  const directory=createFacebookDirectoryService({db,decrypt:v=>v,encrypt:v=>`sealed:${v}`,createClient:()=>({listBusinesses:async()=>({items:[{id:'500',name:'Test BM'}],nextCursor:null}),listBusinessPages:async()=>({items:[{id:'100',name:'New directory name',profileUrl:'https://www.facebook.com/100',avatarUrl:null}],nextCursor:null}),listUserPages:async()=>({items:[{id:'100',name:'New directory name',profileUrl:null,avatarUrl:null,pageToken:'management-page',tasks:grant.pages[0].tasks}],nextCursor:null}),inspectPageToken:inspect})});
  await directory.refresh(ctx,connectionId);await directory.select(ctx,page.id);
  assert.equal((await directory.list(ctx)).items[0].publishingAccountId,f.accounts[0].id);
  const access=createFacebookPageAccess({db,decrypt:v=>{assert.notEqual(v,'original-do-not-touch');return v;},inspect});
  let invalidate=false;
  const service=createFacebookManagementEngagement({db,resolvePageAccess:access.resolvePageAccess,executeFacebookSend:createFacebookSendExecutor({db}).executeFacebookSend,createClient:()=>({listConversations:async()=>{if(invalidate)throw new FacebookEngagementError('authorization_invalid');return{items:[{id:'c1',counterpartyId:'300'}],nextCursor:null};},getConversation:async()=>({id:'c1',counterpartyId:'300'}),listMessages:async()=>({items:[{id:'m1',conversationId:'c1',senderId:'300',recipientId:'100',inbound:true,text:'Synthetic test',timestamp:new Date().toISOString()}],nextCursor:null}),listComments:async()=>({items:[{id:'100_10',postId:'100_1',text:'Synthetic comment'}],nextCursor:null}),sendMessage:async()=>({status:'sent',providerId:'sent-m1'}),replyComment:async()=>({status:'sent',providerId:'sent-c1'})})});
  assert.equal((await service.messages(ctx,'c1')).items.length,1);assert.equal((await service.comments(ctx,schedule.id)).items.length,1);
  await service.replyMessage(ctx,{conversationId:'c1',text:'Synthetic reply',requestKey:randomUUID()});
  await service.replyComment(ctx,{scheduleId:schedule.id,commentId:'100_10',text:'Synthetic reply',requestKey:randomUUID()});
  const subscriptions=createFacebookSubscriptionService({db,appId:'123',resolvePageAccess:access.resolvePageAccess,createClient:()=>({getSubscribedFields:async()=>['mention'],subscribe:async fields=>{assert.ok(fields.includes('mention'));return true;}})});
  try{
    await subscriptions.enableNotifications(ctx);
    invalidate=true;await assert.rejects(()=>service.conversations(ctx));
    assert.equal((await db.facebookManagementConnection.findUniqueOrThrow({where:{id:connectionId}})).status,'authorization_invalid');
    await store.disconnect(ctx,connectionId);
    const reception=createFacebookManagementReceptionStore({db,appId:'123'});
    const old=new Date(Date.now()-91*86400000);
    await db.facebookInteractionComment.create({data:{managedPageId:page.id,providerId:'old',postId:'100_1',text:'Expired synthetic body',occurredAt:old,receivedAt:old}});
    await reception.prune(new Date());
    assert.equal(await db.facebookInteractionComment.count({where:{managedPageId:page.id,providerId:'old'}}),0);
    assert.deepEqual(await snapshot(),before);
    assert.ok(await db.facebookReceivedEvent.findUnique({where:{id:f.legacy.id}}));
  }finally{await db.facebookManagementSubscription.deleteMany({where:{appId:'123',pageId:'100'}});}
}));

test('workspace manager can disconnect another authorizer without touching publishing',async()=>withFacebookManagementFixture(async(f:any)=>{
  const other=await f.db.user.create({data:{email:`${randomUUID()}@example.test`,name:'Other authorizer',passwordHash:'test-only'}});
  try{
    await f.db.workspaceMember.create({data:{workspaceId:f.workspaceIds[0],userId:other.id,role:'admin',status:'active'}});
    await f.db.facebookManagementConnection.update({where:{id:f.connections[0].id},data:{userId:other.id}});
    const before=await f.snapshot();
    await createFacebookManagementStore(f.db,v=>v).disconnect(f.contexts[0],f.connections[0].id);
    const connection=await f.db.facebookManagementConnection.findUnique({where:{id:f.connections[0].id}});
    assert.equal(connection.userTokenEncrypted,null);
    assert.equal(connection.status,'disconnected');
    assert.deepEqual(await f.snapshot(),before);
    assert.equal((await f.db.facebookManagementConnection.findUnique({where:{id:f.connections[1].id}})).status,'active');
  }finally{await f.db.user.delete({where:{id:other.id}});}
}));

test('workspaceAndUserDeletionRemoveOnlyAuthorizedNewData',async()=>withFacebookManagementFixture(async(f:any)=>{
  const {db}=f,store=createFacebookManagementStore(db,v=>v),reception=createFacebookManagementReceptionStore({db,appId:'123'});
  await store.createState({...f.contexts[0],appId:'123',state:randomUUID(),callbackUrl:'https://example.test/callback'});
  await reception.enqueue([{pageId:'100',eventKey:randomUUID(),kind:'message',providerId:'synthetic-message',senderId:'300',recipientId:'100',text:'Synthetic only',occurredAt:new Date().toISOString()},{pageId:'100',eventKey:randomUUID(),kind:'comment',providerId:'100_10',postId:'100_1',text:'Synthetic only',occurredAt:new Date().toISOString()}]);
  for(const row of await reception.claimBatch(await f.databaseNow(),50)){await reception.processClaim(row,await f.databaseNow());await reception.finishClaim(row.id,row.claimToken);}
  await createFacebookSendExecutor({db}).executeFacebookSend(f.contexts[0],{requestKey:randomUUID(),targetId:'300',kind:'message',text:'Synthetic only'},async()=>({status:'sent',providerId:'test-send'}));
  const pageId=f.pages[0].id;
  assert.equal(await db.facebookInteractionMessage.count({where:{managedPageId:pageId}}),1);
  assert.equal(await db.facebookInteractionComment.count({where:{managedPageId:pageId}}),1);
  const otherBefore=await db.socialAccount.findUnique({where:{id:f.accounts[1].id},include:{credential:true}});
  await db.workspace.delete({where:{id:f.workspaceIds[0]}});
  assert.equal(await db.facebookManagementConnection.count({where:{workspaceId:f.workspaceIds[0]}}),0);
  for(const model of ['facebookInteractionMessage','facebookInteractionComment','facebookInteractionThread','facebookInteractionEvent','facebookInteractionSendAttempt'])assert.equal(await db[model].count({where:{managedPageId:pageId}}),0,model);
  assert.equal(await db.facebookManagementOAuthState.count({where:{workspaceId:f.workspaceIds[0]}}),0);
  assert.deepEqual(await db.socialAccount.findUnique({where:{id:f.accounts[1].id},include:{credential:true}}),otherBefore);
  const author=await db.user.create({data:{email:`${randomUUID()}@example.test`,name:'Deleted authorizer',passwordHash:'test-only'}});
  await db.workspaceMember.create({data:{workspaceId:f.workspaceIds[1],userId:author.id,role:'admin',status:'active'}});
  await db.facebookManagementConnection.update({where:{id:f.connections[1].id},data:{userId:author.id}});
  await db.user.delete({where:{id:author.id}});
  assert.equal(await db.facebookManagementConnection.count({where:{id:f.connections[1].id}}),0);
  assert.deepEqual(await db.socialAccount.findUnique({where:{id:f.accounts[1].id},include:{credential:true}}),otherBefore);
}));

test('removed disabled or demoted authorizer cannot silently regain an old grant',async()=>withFacebookManagementFixture(async(f:any)=>{
  const http=await startFacebookManagementHttp();
  const other=await f.db.user.create({data:{email:`${randomUUID()}@example.test`,name:'Removable authorizer',passwordHash:'test-only'}});
  try{
    const session=await f.db.userSession.findUnique({where:{id:f.sessionId}});
    const token=jwt.sign({sub:f.userId,email:`${f.userId}@example.test`,sid:f.sessionId,jti:session.tokenId},'facebook-management-http-test-only');
    const before=await f.snapshot();
    for(const mode of ['remove','disable','demote']){
      const member=await f.db.workspaceMember.upsert({where:{workspaceId_userId:{workspaceId:f.workspaceIds[0],userId:other.id}},create:{workspaceId:f.workspaceIds[0],userId:other.id,role:'admin',status:'active'},update:{role:'admin',status:'active'}});
      await f.db.facebookManagementConnection.update({where:{id:f.connections[0].id},data:{userId:other.id,status:'active',userTokenEncrypted:'new-only'}});
      await f.db.facebookManagedPage.update({where:{id:f.pages[0].id},data:{active:true,pageTokenEncrypted:'page-only',notificationsEnabled:true}});
      await f.db.facebookManagementPageSelection.upsert({where:{workspaceId_pageId:{workspaceId:f.workspaceIds[0],pageId:'100'}},create:{workspaceId:f.workspaceIds[0],pageId:'100',managedPageId:f.pages[0].id},update:{managedPageId:f.pages[0].id}});
      const response=await fetch(`${http.origin}/api/v1/workspaces/${f.workspaceIds[0]}/members/${member.id}`,{method:mode==='remove'?'DELETE':'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(mode==='remove'?{}:{body:JSON.stringify(mode==='disable'?{status:'disabled'}:{role:'viewer'})})});
      assert.equal(response.status,200,await response.text());
      const retired=await f.db.facebookManagementConnection.findUnique({where:{id:f.connections[0].id}});
      assert.equal(retired.userTokenEncrypted,null,`${mode} must destroy only the independent token`);
      await f.db.workspaceMember.upsert({where:{workspaceId_userId:{workspaceId:f.workspaceIds[0],userId:other.id}},create:{workspaceId:f.workspaceIds[0],userId:other.id,role:'admin',status:'active'},update:{role:'admin',status:'active'}});
      const access=createFacebookPageAccess({db:f.db,decrypt:v=>v,inspect:async()=>({pageId:'100',scopes:f.scopes,granularScopes:[],expiresAt:null})});
      await assert.rejects(()=>access.resolvePageAccess(f.contexts[0]),/unavailable|not found/i);
      assert.deepEqual(await f.snapshot(),before);
    }
  }finally{await http.stop();await f.db.user.delete({where:{id:other.id}});}
}));
