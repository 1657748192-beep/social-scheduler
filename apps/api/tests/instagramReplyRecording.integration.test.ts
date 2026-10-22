import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {withMetaInboxFixture,type MetaInboxFixture} from './helpers/metaInboxFixture';
import {createInstagramSendExecutor} from '../src/instagramManagement/sendAttempts';
import {parseInstagramReplyRecording,recordingTexts} from '../src/instagramManagement/replyRecording';
import {createInstagramManagementEngagement} from '../src/instagramManagement/engagement';
import {createInstagramManagementAccess} from '../src/instagramManagement/access';
import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';
import {createInstagramManagementRuntime} from '../src/instagramManagement/runtime';
import {createInstagramInboxAdapter} from '../src/interactionInbox/adapters/instagram';
import {createInboxAccess} from '../src/interactionInbox/access';
import {createInboxProjection} from '../src/interactionInbox/projection';
import {createInboxReads} from '../src/interactionInbox/reads';
import {createInboxSends} from '../src/interactionInbox/sends';

async function setup(f:MetaInboxFixture,sendEnabled=true){
 const accountId=f.instagramAccountIds[0],connectionId=f.instagramConnectionIds[0];
 await f.db.socialAccount.update({where:{id:accountId},data:{capabilities:{profileUsername:'mooyamcosmetic'}}});
 const common={workspaceId:f.adminCtx.workspaceId,connectionId,connectionVersion:1,actorId:'300',inbound:true,occurredAt:new Date()};
 const comment=await f.db.instagramInteractionComment.create({data:{...common,providerId:'comment-rec1',mediaId:'media-rec1',text:'SS-IG-C-1022-REC1 review demo'}});
 const message=await f.db.instagramInteractionMessage.create({data:{...common,providerId:'message-rec1',conversationId:'local:rec1',text:'SS-IG-DM-1022-REC1 review demo'}});
 const rule=parseInstagramReplyRecording(JSON.stringify({enabled:true,userId:f.adminCtx.userId,workspaceId:f.adminCtx.workspaceId,accountId,appId:'456',providerAccountId:'100',connectionId,connectionVersion:1,username:'mooyamcosmetic',expiresAt:new Date(Date.now()+60000).toISOString(),comment:{sourceRecordId:comment.id,providerEventId:comment.providerId,actorId:'300',mediaId:comment.mediaId},message:{sourceRecordId:message.id,providerEventId:message.providerId,actorId:'300',conversationId:message.conversationId}}))!;
 const policy=createLiveInboxPolicy([{workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',readEnabled:true,sendEnabled,policy:{product:'synthetic',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:1,replyWindowMs:86400000,reviewed:true}}]);
 let reads=0,sends=0;
 const access=createInstagramManagementAccess({db:f.db,appId:'456',policy,decrypt:v=>v,inspect:async()=>({appId:'456',providerAccountId:'100',scopes:['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'],expiresAt:new Date(Date.now()+86400000)})});
 const asset=await access.resolve(f.adminCtx,accountId,'messages.read');
 const sources={comment:{...asset.sourceRef!,sourceRecordId:comment.id,commentId:comment.providerId,mediaId:comment.mediaId},message:{...asset.sourceRef!,sourceRecordId:message.id,conversationId:message.conversationId,participantId:'300'}};
 const engagement=createInstagramManagementEngagement({db:f.db,access,policy,testRestriction:rule,graph:()=>({media:async()=>{reads++;return{items:[{id:comment.mediaId}],nextCursor:null};},replyComment:async()=>{sends++;return{status:'sent',providerId:'reply-comment'};},sendMessage:async()=>{sends++;return{status:'sent',providerId:'reply-message'};}} as any),isDeleted:async()=>false,verifiedCommentLimit:1000});
 const input=(kind:'comment'|'message',patch:any={})=>({asset,source:sources[kind],requestKey:randomUUID(),kind,targetId:kind==='comment'?comment.providerId:'300',text:recordingTexts[kind],...patch});
 return{rule,asset,sources,input,engagement,policy,calls:()=>({reads,sends})};
}

test('recording config is absent by default and malformed configuration fails closed without leaking input',()=>{
 assert.equal(parseInstagramReplyRecording(undefined),null);
 for(const value of ['', 'null','[]','{}','{"enabled":false,"secret":"private"}'])assert.throws(()=>parseInstagramReplyRecording(value),e=>e instanceof Error&&e.message==='Invalid Instagram reply recording configuration');
});
test('recording guard rejects wrong target, text, account and administrator before provider reads or claims',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),before=await f.publishingSnapshot();
 for(const [asset,source,text] of [[s.asset,s.sources.comment,'wrong'],[s.asset,{...s.sources.comment,sourceRecordId:randomUUID()},recordingTexts.comment],[{...s.asset,ctx:f.viewerCtx},s.sources.comment,recordingTexts.comment],[{...s.asset,accountId:f.instagramAccountIds[1]},s.sources.comment,recordingTexts.comment]] as const)await assert.rejects(s.engagement.reply(asset,source,text,randomUUID()));
 assert.deepEqual(s.calls(),{reads:0,sends:0});assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('different keys and recreated executors cannot dispatch a recording target twice, including concurrent requests',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),executor=createInstagramSendExecutor({db:f.db,testRestriction:s.rule});let calls=0,release!:()=>void,started!:()=>void;
 const gate=new Promise<void>(r=>release=r),waiting=new Promise<void>(r=>started=r);
 const first=executor.execute(s.input('message'),async()=>{calls++;started();await gate;return{status:'sent',providerId:'sent-one'};});await waiting;
 try{assert.equal((await createInstagramSendExecutor({db:f.db,testRestriction:s.rule}).execute(s.input('message'),async()=>{calls++;return{status:'sent',providerId:'duplicate'};})).status,'unknown');}finally{release();}
 assert.equal((await first).status,'sent');
 assert.deepEqual(await executor.execute(s.input('message'),async()=>{throw Error('must not dispatch');}),{status:'sent',providerId:'sent-one',replayed:true});assert.equal(calls,1);
 assert.equal((await executor.execute(s.input('comment'),async()=>{calls++;return{status:'sent',providerId:'comment-one'};})).status,'sent');assert.equal(calls,2);
}));
for(const status of ['failed','unknown','throw'] as const)test(`recording ${status} consumes the single attempt across new request keys`,async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),executor=createInstagramSendExecutor({db:f.db,testRestriction:s.rule});let calls=0;
 await executor.execute(s.input('comment'),async()=>{calls++;if(status==='throw')throw Error('transport');return status==='failed'?{status,code:'denied',diagnosticId:randomUUID()}:{status,diagnosticId:randomUUID()};});
 await executor.execute(s.input('comment'),async()=>{calls++;return{status:'sent',providerId:'bad'};});assert.equal(calls,1);
}));
test('recording details expose fixed manual copy only for the selected record, then report consumption',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),detail=await s.engagement.detail(s.asset,s.sources.comment);
 assert.deepEqual(detail.recordingReply,{text:recordingTexts.comment,expiresAt:s.rule.expiresAt,state:'available'});assert.equal(s.calls().sends,0);
 await s.engagement.reply(s.asset,s.sources.comment,recordingTexts.comment,randomUUID());assert.equal((await s.engagement.detail(s.asset,s.sources.comment)).recordingReply?.state,'used');
 assert.equal((await s.engagement.reply(s.asset,s.sources.comment,recordingTexts.comment,randomUUID())).status,'sent');assert.equal(s.calls().sends,1);
}));
test('recording configuration never overrides the existing send gate or enables webhooks',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f,false);await assert.rejects(s.engagement.reply(s.asset,s.sources.message,recordingTexts.message,randomUUID()));assert.equal(s.calls().sends,0);
 assert.equal((await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:f.instagramConnectionIds[0]}})).notificationsEnabled,false);
}));
test('recording source and identity fences reject every substituted binding without creating an attempt',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),executor=createInstagramSendExecutor({db:f.db,testRestriction:s.rule});let sends=0;const send=async()=>{sends++;return{status:'sent' as const,providerId:'bad'};};
 const base=s.input('message');
 for(const asset of [{...s.asset,appNamespace:'999'},{...s.asset,connectionVersion:2},{...s.asset,providerAssetId:'999'},{...s.asset,ctx:f.foreignCtx},{...s.asset,ctx:{...s.asset.ctx,accountIds:[]}}])await assert.rejects(executor.execute({...base,asset},send));
 for(const source of [{...s.sources.message,participantId:'301'},{...s.sources.message,conversationId:'local:foreign'},{...s.sources.message,connectionId:f.instagramConnectionIds[1]},{...s.sources.message,sourceRecordId:randomUUID()},{...s.sources.message,connectionVersion:2}])await assert.rejects(executor.execute({...base,source},send));
 for(const patch of [{kind:'comment' as const},{targetId:'301'},{text:recordingTexts.message+' changed'},{source:undefined}])await assert.rejects(executor.execute({...base,...patch},send));
 await f.db.instagramInteractionMessage.update({where:{id:s.rule.message.sourceRecordId},data:{text:'SS-IG-DM-1022-REC10 not REC1'}});await assert.rejects(executor.execute(base,send));
 assert.equal(sends,0);assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
}));
test('expired entries and deleted targets stay closed; other records remain readable but not replyable',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),expired={...s.rule,expiresAt:new Date(Date.now()-1000).toISOString()};
 await assert.rejects(createInstagramSendExecutor({db:f.db,testRestriction:expired}).execute(s.input('comment'),async()=>{throw Error('no dispatch');}));
 const other=await f.db.instagramInteractionComment.create({data:{workspaceId:f.adminCtx.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'other-comment',mediaId:s.rule.comment.mediaId,actorId:'300',inbound:true,text:'Other comment',occurredAt:new Date()}});
 const source={...s.sources.comment,sourceRecordId:other.id,commentId:other.providerId},detail=await s.engagement.detail(s.asset,source);
 assert.equal(detail.items[0].text,'Other comment');assert.equal(detail.recordingReply,undefined);assert.ok(detail.capabilities.filter(v=>v.capability.endsWith('.reply')).every(v=>!v.available));
 await f.db.instagramInteractionComment.update({where:{id:s.rule.comment.sourceRecordId},data:{deleted:true,text:null}});
 await assert.rejects(s.engagement.reply(s.asset,s.sources.comment,recordingTexts.comment,randomUUID()));assert.equal(s.calls().sends,0);
}));
test('a permission change or stale record still prevents the recording dispatch',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),before=await f.publishingSnapshot();
 await f.db.instagramInteractionMessage.update({where:{id:s.rule.message.sourceRecordId},data:{occurredAt:new Date(Date.now()-2*86400000)}});
 await assert.rejects(s.engagement.reply(s.asset,s.sources.message,recordingTexts.message,randomUUID()));
 await f.db.instagramManagementConnection.update({where:{id:s.rule.connectionId},data:{scopes:['instagram_business_basic']}});
 await assert.rejects(s.engagement.reply(s.asset,s.sources.comment,recordingTexts.comment,randomUUID()));assert.equal(s.calls().sends,0);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('runtime wiring carries the restriction through unified case reads and manual sends without enabling reception',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),before=await f.publishingSnapshot();let sends=0;
 const runtime=createInstagramManagementRuntime({db:f.db,config:{enabled:true,appId:'456',appSecret:'synthetic-only',graphVersion:'v25.0',callbackUrl:'https://example.test/callback',requiredScopes:[]},policy:s.policy,testRestriction:s.rule,encrypt:v=>v,decrypt:v=>v,inspect:async()=>({appId:'456',providerAccountId:'100',scopes:['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'],expiresAt:new Date(Date.now()+86400000)}),isDeleted:async()=>false,fetchImpl:async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://graph.instagram.com');
  if(url.pathname==='/v25.0/100/media'&&(init?.method??'GET')==='GET')return Response.json({data:[{id:s.rule.comment.mediaId}]});
  if(url.pathname==='/v25.0/comment-rec1/replies'&&init?.method==='POST'){sends++;return Response.json({id:'manual-reply'});}
  throw Error('Unexpected synthetic endpoint');
 }});
 const access=createInboxAccess({db:f.db,facebookEnabled:false,instagram:{enabled:true,access:runtime.access},policy:s.policy,verifyFacebook:async()=>{throw Error('not Facebook');}}),adapter=createInstagramInboxAdapter({db:f.db,access:runtime.access,engagement:runtime.engagement,policy:s.policy}),registry={getInboxAdapter:()=>adapter} as any;
 const projection=createInboxProjection({db:f.db,access,policy:s.policy}),items=await runtime.engagement.normalizeVerifiedEvent([s.rule.comment.sourceRecordId],s.asset);
 await projection.projectVerifiedPage(f.adminCtx,s.asset,{items,nextCursor:null,coverage:'verified_selected_sources',warnings:[]});
 const c=await f.db.interactionCase.findFirstOrThrow({where:{workspaceId:f.adminCtx.workspaceId,kind:'comments'}}),reads=createInboxReads({db:f.db,access,policy:s.policy,registry,redis:{eval:async()=>{throw Error('no search');}}}),send=createInboxSends({db:f.db,access,registry});
 const detail=await reads.getCase(f.adminCtx,c.id,{accountIds:[s.asset.accountId],kind:'comments',limit:25});assert.equal(detail.recordingReply?.text,recordingTexts.comment);assert.equal(sends,0);assert.equal(runtime.receptionEnabled,false);
 const input={targetId:detail.replyTarget!,text:recordingTexts.comment,requestKey:randomUUID()};assert.equal((await send.replyToCase(f.adminCtx,c.id,input)).status,'sent');
 assert.deepEqual(await send.replyToCase(f.adminCtx,c.id,{...input,requestKey:randomUUID()}),{status:'sent',providerId:'manual-reply',replayed:true});assert.equal(sends,1);
 assert.equal((await reads.getCase(f.adminCtx,c.id,{accountIds:[s.asset.accountId],kind:'comments',limit:25})).recordingReply?.state,'used');assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('lost receipt persistence leaves a durable consumed claim and never repeats the dispatch',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f);let calls=0;
 const db=new Proxy(f.db,{get(target,key){
  if(key==='instagramInteractionSendAttempt')return new Proxy(target.instagramInteractionSendAttempt,{get(model,method){return method==='updateMany'?async()=>{throw Error('Synthetic receipt write failure');}:Reflect.get(model,method);}});
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 const result=await createInstagramSendExecutor({db,testRestriction:s.rule}).execute(s.input('message'),async()=>{calls++;return{status:'sent',providerId:'confirmed-but-not-saved'};});assert.equal(result.status,'unknown');
 assert.equal((await createInstagramSendExecutor({db:f.db,testRestriction:s.rule}).execute(s.input('message'),async()=>{calls++;return{status:'sent',providerId:'bad'};})).status,'unknown');assert.equal(calls,1);
}));
test('an older different text consumes the target without claiming the recording text was successfully sent',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f);let calls=0;
 await createInstagramSendExecutor({db:f.db}).execute(s.input('message',{text:'An earlier different reply'}),async()=>{calls++;return{status:'sent',providerId:'older-reply'};});
 const result=await createInstagramSendExecutor({db:f.db,testRestriction:s.rule}).execute(s.input('message'),async()=>{calls++;return{status:'sent',providerId:'bad'};});assert.equal(result.status,'unknown');assert.equal(calls,1);
}));
