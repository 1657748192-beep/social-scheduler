import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {createFacebookManagementEngagement} from '../src/facebookManagement/engagement';
import {createFacebookPageAccess} from '../src/facebookManagement/access';
import {createFacebookSendExecutor} from '../src/facebookManagement/sendAttempts';
import {FacebookEngagementError} from '../src/integrations/social/facebookEngagement';
import {createFacebookManagementReceptionStore} from '../src/facebookManagement/receptionStore';

async function fixture(run:(f:any)=>Promise<void>){
  const url=process.env.FACEBOOK_TEST_DATABASE_URL;assert.ok(url,'Independent database required');assert.match(new URL(url).pathname,/_test$/);assert.notEqual(url,process.env.DATABASE_URL);
  const db=new PrismaClient({datasources:{db:{url}}}),userId=randomUUID(),viewerId=randomUUID(),workspaceId=randomUUID(),sessionId=randomUUID(),viewerSession=randomUUID();
  try{
    for(const id of [userId,viewerId])await db.user.create({data:{id,email:`${id}@example.test`,name:'Engagement test',passwordHash:'not-real'}});
    await db.workspace.create({data:{id:workspaceId,ownerId:userId,name:'Test',slug:workspaceId}});
    for(const [id,role,session] of [[userId,'owner',sessionId],[viewerId,'viewer',viewerSession]]){
      await db.workspaceMember.create({data:{userId:id,workspaceId,role:role as 'owner'|'viewer',status:'active'}});
      await db.userSession.create({data:{id:session,userId:id,tokenId:randomUUID(),expiresAt:new Date(Date.now()+86400000)}});
    }
    const scopes=['pages_read_engagement','pages_read_user_content','pages_manage_engagement','pages_manage_metadata','pages_messaging'];
    const connection=await db.facebookManagementConnection.create({data:{appId:'123',workspaceId,userId,providerUserId:'200',userTokenEncrypted:'sealed:new-user',scopes}});
    const page=await db.facebookManagedPage.create({data:{connectionId:connection.id,pageId:'100',name:'Page',pageTokenEncrypted:'sealed:new-page',tasks:['MESSAGING','MODERATE'],scopes}});
    await db.facebookManagementPageSelection.create({data:{workspaceId,pageId:'100',managedPageId:page.id}});
    const account=await db.socialAccount.create({data:{workspaceId,platform:'facebook',providerAccountId:'100',accountType:'page',displayName:'Page',credential:{create:{accessTokenEncrypted:'original-do-not-use',scopes:['pages_manage_posts']}}}});
    const post=await db.post.create({data:{workspaceId,authorId:userId,baseText:'Published',variants:{create:{platform:'facebook',socialAccountId:account.id,text:'Published',publishStatus:'published'}}},include:{variants:true}});
    const schedule=await db.schedule.create({data:{workspaceId,postVariantId:post.variants[0].id,createdBy:userId,scheduledAt:new Date(),status:'published'}});
    const job=await db.publishJob.create({data:{workspaceId,postVariantId:post.variants[0].id,scheduleId:schedule.id,status:'succeeded',idempotencyKey:randomUUID(),providerPostId:'100_1',rawResponse:{id:'100_1'}}});
    const snapshot=async()=>({account:await db.socialAccount.findUnique({where:{id:account.id},include:{credential:true}}),schedule:await db.schedule.findUnique({where:{id:schedule.id},include:{postVariant:true,publishJobs:true}})});
    const now=new Date(),ctx={userId,workspaceId,sessionId,managedPageId:page.id},viewer={...ctx,userId:viewerId,sessionId:viewerSession};
    let messages=[{id:'m1',conversationId:'c1',senderId:'300',recipientId:'100',inbound:true,text:'Inbound',timestamp:new Date(now.getTime()-23*3600000-59*60000).toISOString()}],fail=false,tokenValid=true,calls=0;
    const api={
      listConversations:async()=>{if(fail)throw new FacebookEngagementError('temporary_failure');return{items:[{id:'c1',counterpartyId:'300',counterpartyName:'Customer',updatedAt:now.toISOString()}],nextCursor:null};},
      getConversation:async(id:string)=>{if(id!=='c1')throw new FacebookEngagementError('invalid_response');return{id:'c1',counterpartyId:'300',updatedAt:now.toISOString()};},
      listMessages:async()=>({items:messages,nextCursor:null}),
      listComments:async(postId:string)=>({items:[{id:'100_10',postId,text:'Comment',timestamp:now.toISOString()}],nextCursor:null}),
      sendMessage:async()=>{calls++;return{status:'sent' as const,providerId:'message-sent'};},replyComment:async()=>{calls++;return{status:'sent' as const,providerId:'comment-sent'};}
    };
    const access=createFacebookPageAccess({db,decrypt:v=>{assert.notEqual(v,'original-do-not-use');return v.replace('sealed:','');},inspect:async(id,token)=>{
      assert.ok(['new-page','fresh-page'].includes(token));if(!tokenValid)throw Error('inspection unavailable');return{pageId:id,scopes,granularScopes:[],expiresAt:null};}});
    const service=createFacebookManagementEngagement({db,resolvePageAccess:access.resolvePageAccess,executeFacebookSend:createFacebookSendExecutor({db}).executeFacebookSend,createClient:({accessToken}:any)=>{assert.equal(accessToken,'new-page');return api;},now:()=>now});
    await run({db,ctx,viewer,page,connection,account,schedule,job,snapshot,service,api,access,now,calls:()=>calls,setFail:(v:boolean)=>{fail=v;},setTokenValid:(v:boolean)=>{tokenValid=v;},setMessages:(v:any)=>{messages=v;}});
  }finally{await db.workspace.deleteMany({where:{id:workspaceId,ownerId:userId}});await db.user.deleteMany({where:{id:{in:[userId,viewerId]}}});await db.$disconnect();}
}

test('readsGraphWithoutWebhookHistory',async()=>fixture(async({db,ctx,service,schedule,snapshot,setFail,setTokenValid,calls}:any)=>{
  const before=await snapshot();assert.equal(await db.facebookInteractionEvent.count({where:{managedPageId:ctx.managedPageId}}),0);
  assert.equal((await service.conversations(ctx)).items[0].id,'c1');
  assert.equal((await service.messages(ctx,'c1')).items[0].text,'Inbound');
  assert.equal((await service.comments(ctx,schedule.id)).items[0].text,'Comment');
  setFail(true);await assert.rejects(service.conversations(ctx));setFail(false);setTokenValid(false);
  await assert.rejects(service.replyMessage(ctx,{conversationId:'c1',text:'Reply',requestKey:randomUUID()}));assert.equal(calls(),0);
  assert.deepEqual(await snapshot(),before);
}));

test('pageConversationAndPostIdentityAreServerVerified',async()=>fixture(async({db,ctx,viewer,service,schedule,job,account,calls}:any)=>{
  const reply=()=>({scheduleId:schedule.id,commentId:'100_10',text:'Reply',requestKey:randomUUID()});
  assert.equal((await service.conversations(viewer)).items.length,1);
  await assert.rejects(service.replyComment(viewer,reply()));
  await assert.rejects(service.comments({...ctx,workspaceId:randomUUID()},schedule.id));
  await assert.rejects(service.messages(ctx,'foreign-conversation'));
  await assert.rejects(service.replyComment(ctx,{...reply(),commentId:'999_99'}));
  await db.publishJob.update({where:{id:job.id},data:{rawResponse:{simulated:true}}});await assert.rejects(service.comments(ctx,schedule.id));
  await db.publishJob.update({where:{id:job.id},data:{rawResponse:{id:'100_1'},providerPostId:'999_1'}});await assert.rejects(service.comments(ctx,schedule.id));
  await db.publishJob.update({where:{id:job.id},data:{providerPostId:'100_1'}});
  await db.socialAccount.update({where:{id:account.id},data:{status:'disconnected'}});await assert.rejects(service.conversations(ctx));assert.equal(calls(),0);
}));

test('replyWindowUsesTrustedInboundNotEchoOrFutureTime',async()=>fixture(async({ctx,service,schedule,now,setMessages,calls}:any)=>{
  assert.equal((await service.replyMessage(ctx,{conversationId:'c1',text:'Reply',requestKey:randomUUID()})).status,'sent');
  for(const messages of [[],[{id:'old',conversationId:'c1',senderId:'300',recipientId:'100',inbound:true,text:'old',timestamp:new Date(now.getTime()-86400000).toISOString()}],[{id:'echo',conversationId:'c1',senderId:'100',recipientId:'300',inbound:false,text:'echo',timestamp:now.toISOString()}],[{id:'future',conversationId:'c1',senderId:'300',recipientId:'100',inbound:true,text:'future',timestamp:new Date(now.getTime()+1000).toISOString()}]]){
    setMessages(messages);await assert.rejects(service.replyMessage(ctx,{conversationId:'c1',text:'Reply',requestKey:randomUUID()}));
  }
  for(const text of [' ','a'.repeat(2001)])await assert.rejects(service.replyMessage(ctx,{conversationId:'c1',text,requestKey:randomUUID()}));
  for(const text of [' ','a'.repeat(8001)])await assert.rejects(service.replyComment(ctx,{scheduleId:schedule.id,commentId:'100_10',text,requestKey:randomUUID()}));
  assert.equal((await service.replyComment(ctx,{scheduleId:schedule.id,commentId:'100_10',text:'Comment reply',requestKey:randomUUID()})).status,'sent');
  assert.equal(calls(),2);
}));

test('staleTokenFailureCannotInvalidateNewerGrantOrPublishing',async()=>fixture(async({db,ctx,connection,service,api,snapshot}:any)=>{
  const before=await snapshot();
  api.listConversations=async()=>{
    await db.facebookManagementConnection.update({where:{id:connection.id},data:{version:{increment:1}}});
    throw new FacebookEngagementError('authorization_invalid');
  };
  await assert.rejects(service.conversations(ctx));
  assert.equal((await db.facebookManagementConnection.findUniqueOrThrow({where:{id:connection.id}})).status,'active');
  api.listConversations=async()=>{throw new FacebookEngagementError('authorization_invalid');};
  await assert.rejects(service.conversations(ctx));
  assert.equal((await db.facebookManagementConnection.findUniqueOrThrow({where:{id:connection.id}})).status,'authorization_invalid');
  assert.deepEqual(await snapshot(),before);
}));

test('sendUsesTheRevalidatedGrantNotTheEarlierReadToken',async()=>fixture(async({db,ctx,page,connection,api,access,now}:any)=>{
  const sentTokens:string[]=[],originalRead=api.listMessages;
  api.listMessages=async()=>{
    const result=await originalRead();
    await db.facebookManagedPage.update({where:{id:page.id},data:{pageTokenEncrypted:'sealed:fresh-page'}});
    await db.facebookManagementConnection.update({where:{id:connection.id},data:{version:{increment:1}}});return result;
  };
  const service=createFacebookManagementEngagement({db,resolvePageAccess:access.resolvePageAccess,executeFacebookSend:createFacebookSendExecutor({db}).executeFacebookSend,now:()=>now,
    createClient:({accessToken})=>({...api,sendMessage:async()=>{sentTokens.push(accessToken);return{status:'sent',providerId:'fresh-send'};}})});
  assert.equal((await service.replyMessage(ctx,{conversationId:'c1',text:'Reply',requestKey:randomUUID()})).status,'sent');
  assert.deepEqual(sentTokens,['fresh-page']);
}));

test('newReceivedBodiesMergeButNeverMaskFailedGraphReads',async()=>fixture(async({db,ctx,api,access,now,schedule}:any)=>{
  const received=createFacebookManagementReceptionStore({db,appId:'123'});
  await db.facebookInteractionComment.create({data:{managedPageId:ctx.managedPageId,providerId:'100_10',postId:'100_1',deleted:true,occurredAt:now}});
  await db.facebookInteractionMessage.create({data:{managedPageId:ctx.managedPageId,providerId:'m-received',participantId:'300',senderId:'300',recipientId:'100',text:'New received',occurredAt:now}});
  const service=createFacebookManagementEngagement({db,resolvePageAccess:access.resolvePageAccess,executeFacebookSend:createFacebookSendExecutor({db}).executeFacebookSend,createClient:()=>api,now:()=>now,
    receivedMessages:received.messages,receivedComments:received.comments,latestInbound:received.latestInbound} as any);
  assert.equal((await service.comments(ctx,schedule.id)).items.length,0);
  const messages=await service.messages(ctx,'c1');assert.ok(messages.items.some((m:any)=>m.id==='m-received'&&m.text==='New received'));assert.equal(messages.source,'mixed');
  api.listComments=async()=>{throw new FacebookEngagementError('temporary_failure');};await assert.rejects(service.comments(ctx,schedule.id));
  api.listMessages=async()=>{throw new FacebookEngagementError('temporary_failure');};await assert.rejects(service.messages(ctx,'c1'));
}));
