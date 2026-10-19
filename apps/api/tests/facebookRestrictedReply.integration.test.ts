import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {createFacebookSendExecutor} from '../src/facebookManagement/sendAttempts';
import {createFacebookManagementEngagement} from '../src/facebookManagement/engagement';
import {parseFacebookReplyTestRestriction} from '../src/facebookManagement/replyTestRestriction';

async function fixture(run:(f:any)=>Promise<void>){
 const url=process.env.FACEBOOK_TEST_DATABASE_URL;assert.ok(url);assert.match(new URL(url).pathname,/_test$/);assert.notEqual(url,process.env.DATABASE_URL);
 const db=new PrismaClient({datasources:{db:{url}}}),userId=randomUUID(),workspaceId=randomUUID(),sessionId=randomUUID();
 try{
  await db.user.create({data:{id:userId,email:`${userId}@example.test`,name:'Restricted test',passwordHash:'not-real'}});
  await db.workspace.create({data:{id:workspaceId,ownerId:userId,name:'Test',slug:workspaceId}});
  await db.workspaceMember.create({data:{userId,workspaceId,role:'owner',status:'active'}});
  await db.userSession.create({data:{id:sessionId,userId,tokenId:randomUUID(),expiresAt:new Date(Date.now()+86400000)}});
  const connection=await db.facebookManagementConnection.create({data:{appId:'123',userId,workspaceId,providerUserId:'200',userTokenEncrypted:'sealed:user',scopes:['pages_messaging']}});
  const page=await db.facebookManagedPage.create({data:{connectionId:connection.id,pageId:'100',name:'Page',pageTokenEncrypted:'sealed:page',tasks:['MESSAGING'],scopes:['pages_messaging']}});
  await db.facebookManagementPageSelection.create({data:{workspaceId,pageId:'100',managedPageId:page.id}});
  await db.socialAccount.create({data:{workspaceId,platform:'facebook',providerAccountId:'100',accountType:'page',displayName:'Page'}});
  const ctx={userId,workspaceId,sessionId,managedPageId:page.id},input={requestKey:randomUUID(),targetId:'300',kind:'message',text:'One controlled reply'};
  const restriction={userId,workspaceId,managedPageId:page.id,appId:'123',pageId:'100',connectionId:connection.id,connectionVersion:1,conversationId:'c1',participantId:'300',textSha256:createHash('sha256').update(input.text).digest('hex'),expiresAt:new Date(Date.now()+3600000).toISOString()};
  const executor=(rule=restriction)=>createFacebookSendExecutor({db,testRestriction:rule} as any).executeFacebookSend;
  const reads:string[]=[];
  const api={getConversation:async(id:string)=>{reads.push(id);return{id,counterpartyId:id==='c1'?'300':'999',updatedAt:new Date().toISOString()};},listConversations:async()=>({items:[{id:'c1',counterpartyId:'300',updatedAt:new Date().toISOString()},{id:'foreign',counterpartyId:'999',updatedAt:new Date().toISOString()}],nextCursor:null}),listMessages:async(id:string)=>{reads.push('messages:'+id);return{items:[{id:'inbound',conversationId:id,senderId:'300',recipientId:'100',inbound:true,text:'Synthetic incoming',timestamp:new Date().toISOString()}],nextCursor:null};},sendMessage:async()=>({status:'sent' as const,providerId:'one-message'})};
  const service=(rule=restriction)=>createFacebookManagementEngagement({db,testRestriction:rule,resolvePageAccess:async()=>({managedPageId:page.id,pageId:'100',connectionId:connection.id,connectionVersion:1,appId:'123',pageToken:'synthetic-page',tasks:['MESSAGING'],scopes:['pages_messaging','pages_read_engagement','pages_manage_metadata'],role:'owner',publishingAccountId:'synthetic-account'}),executeFacebookSend:executor(rule),createClient:()=>api} as any);
  await run({db,ctx,input,restriction,executor,connection,page,service,reads});
 }finally{await db.workspace.deleteMany({where:{id:workspaceId,ownerId:userId}});await db.user.deleteMany({where:{id:userId}});await db.$disconnect();}
}

test('restrictedReplyRejectsOtherTextRecipientAndCommentBeforeDispatch',async()=>fixture(async({db,ctx,input,executor}:any)=>{
 let dispatches=0;const send=async()=>{dispatches++;return{status:'sent',providerId:'m1'};};
 for(const altered of [{...input,targetId:'301'},{...input,text:'Different reply'},{...input,kind:'comment'}])await assert.rejects(executor()(ctx,altered,send));
 assert.equal(dispatches,0);assert.equal(await db.facebookInteractionSendAttempt.count({where:{managedPageId:ctx.managedPageId}}),0);
}));

test('restrictedReplyConcurrentDifferentKeysDispatchOnlyOnceAndKeepReceipts',async()=>fixture(async({db,ctx,input,executor}:any)=>{
 let dispatches=0;const send=async()=>{dispatches++;return{status:'sent',providerId:'one-message'};};
 const execute=executor();const keys=[randomUUID(),randomUUID()];
 await Promise.all(keys.map(requestKey=>execute(ctx,{...input,requestKey},send)));
 assert.equal(dispatches,1);
 const retry=await executor()(ctx,{...input,requestKey:randomUUID()},send);assert.equal(retry.status,'sent');assert.equal(retry.providerId,'one-message');assert.equal(dispatches,1);
 const rows=await db.facebookInteractionSendAttempt.findMany({where:{managedPageId:ctx.managedPageId}});assert.equal(rows.length,3);assert.equal(JSON.stringify(rows).includes(input.text),false);
}));

test('restrictedReplyUnknownCannotResendWithNewKeyOrNewExecutor',async()=>fixture(async({ctx,input,executor}:any)=>{
 let dispatches=0;const send=async()=>{dispatches++;throw Error('network result unknown');};
 assert.equal((await executor()(ctx,input,send)).status,'unknown');
 assert.equal((await executor()(ctx,{...input,requestKey:randomUUID()},send)).status,'unknown');assert.equal(dispatches,1);
}));

test('restrictedReplyExpiredOrChangedGrantNeverDispatches',async()=>fixture(async({ctx,input,executor,restriction}:any)=>{
 let dispatches=0;const send=async()=>{dispatches++;return{status:'sent',providerId:'no'};};
 for(const changed of [{...restriction,expiresAt:new Date(Date.now()-1).toISOString()},{...restriction,connectionVersion:2},{...restriction,appId:'999'},{...restriction,userId:randomUUID()}])await assert.rejects(executor(changed)(ctx,input,send));
 assert.equal(dispatches,0);
}));

test('restrictedServiceExposesOnlyApprovedConversationAndRejectsOtherReads',async()=>fixture(async({ctx,service,reads}:any)=>{
 const s=service();const threads=await s.conversations(ctx);assert.deepEqual(threads.items.map((x:any)=>x.id),['c1']);assert.equal(threads.nextCursor,null);
 await assert.rejects(s.messages(ctx,'foreign'));await assert.rejects(s.comments(ctx,randomUUID()));
 assert.equal(reads.includes('foreign'),false);assert.equal(reads.includes('messages:foreign'),false);
 assert.equal((await s.messages(ctx,'c1')).items[0].id,'inbound');
}));

test('restrictedServiceRejectsOtherConversationOrTextBeforeProviderReads',async()=>fixture(async({ctx,input,service,reads}:any)=>{
 const s=service();for(const altered of [{conversationId:'foreign',text:input.text,requestKey:randomUUID()},{conversationId:'c1',text:'Changed',requestKey:randomUUID()}])await assert.rejects(s.replyMessage(ctx,altered));
 assert.deepEqual(reads,[]);
}));

test('restrictedConfigurationIsStrictAndNeverFallsBackWhenMalformed',async()=>fixture(async({restriction}:any)=>{
 assert.equal(parseFacebookReplyTestRestriction(undefined),null);
 for(const value of ['', '{}',JSON.stringify({...restriction,extra:true}),JSON.stringify({...restriction,expiresAt:'tomorrow'}),JSON.stringify({...restriction,textSha256:'plaintext'})])assert.throws(()=>parseFacebookReplyTestRestriction(value));
 assert.deepEqual(parseFacebookReplyTestRestriction(JSON.stringify(restriction)),restriction);
}));

test('restrictedReplySameKeyAndFailedResultRemainTerminal',async()=>fixture(async({ctx,input,executor}:any)=>{
 let dispatches=0;const send=async()=>{dispatches++;return{status:'failed',code:'permission_missing',diagnosticId:randomUUID()};};
 const execute=executor();assert.equal((await execute(ctx,input,send)).status,'failed');
 assert.equal((await execute(ctx,input,send)).status,'failed');
 assert.equal((await executor()(ctx,{...input,requestKey:randomUUID()},send)).status,'failed');assert.equal(dispatches,1);
}));

test('restrictedRuleIsCopiedAndInvalidSessionCannotCreateAttempt',async()=>fixture(async({db,ctx,input,executor,restriction}:any)=>{
 const mutable={...restriction};const execute=executor(mutable);mutable.participantId='999';
 let dispatches=0;const send=async()=>{dispatches++;return{status:'sent',providerId:'one-message'};};
 await assert.rejects(execute({...ctx,sessionId:randomUUID()},input,send));
 assert.equal(dispatches,0);assert.equal(await db.facebookInteractionSendAttempt.count({where:{managedPageId:ctx.managedPageId}}),0);
 assert.equal((await execute(ctx,input,send)).status,'sent');assert.equal(dispatches,1);
}));
