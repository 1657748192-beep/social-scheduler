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
import {createHash} from 'node:crypto';
import {presentInboxCase} from '../src/interactionInbox/cases';
import {createMetaSourceRetention} from '../src/interactionInbox/retention';

async function setup(f:MetaInboxFixture,sendEnabled=true,rec2=false,dmRec2=false){
 const accountId=f.instagramAccountIds[0],connectionId=f.instagramConnectionIds[0];
 await f.db.socialAccount.update({where:{id:accountId},data:{capabilities:{profileUsername:'mooyamcosmetic'}}});
 const common={workspaceId:f.adminCtx.workspaceId,connectionId,connectionVersion:1,actorId:'300',inbound:true,occurredAt:new Date()};
 const comment=await f.db.instagramInteractionComment.create({data:{...common,providerId:'comment-rec1',mediaId:'media-rec1',text:'SS-IG-C-1022-REC1 review demo'}});
 const message=await f.db.instagramInteractionMessage.create({data:{...common,providerId:'message-rec1',conversationId:'local:rec1',text:'SS-IG-DM-1022-REC1 review demo'}});
 const next=rec2?await f.db.instagramInteractionComment.create({data:{...common,providerId:'comment-rec2',mediaId:comment.mediaId,text:'SS-IG-C-1023-REC2 review demo'}}):null;
 const nextDm=dmRec2?await f.db.instagramInteractionMessage.create({data:{...common,providerId:'message-rec2',conversationId:message.conversationId,text:'SS-IG-DM-1023-REC2 review demo'}}):null;
 const rule=parseInstagramReplyRecording(JSON.stringify({enabled:true,...(nextDm?{messageRec2:{sourceRecordId:nextDm.id,providerEventId:nextDm.providerId,actorId:'300',conversationId:nextDm.conversationId,expiresAt:new Date(Date.now()+60000).toISOString()}}:{}),...(next?{commentRec2:{sourceRecordId:next.id,providerEventId:next.providerId,actorId:'300',mediaId:next.mediaId,expiresAt:new Date(Date.now()+60000).toISOString()}}:{}),userId:f.adminCtx.userId,workspaceId:f.adminCtx.workspaceId,accountId,appId:'456',providerAccountId:'100',connectionId,connectionVersion:1,username:'mooyamcosmetic',expiresAt:new Date(Date.now()+60000).toISOString(),comment:{sourceRecordId:comment.id,providerEventId:comment.providerId,actorId:'300',mediaId:comment.mediaId},message:{sourceRecordId:message.id,providerEventId:message.providerId,actorId:'300',conversationId:message.conversationId}}))!;
 const policy=createLiveInboxPolicy([{workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',readEnabled:true,sendEnabled,policy:{product:'synthetic',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:1,replyWindowMs:86400000,reviewed:true}}]);
 let reads=0,sends=0;
 const access=createInstagramManagementAccess({db:f.db,appId:'456',policy,decrypt:v=>v,inspect:async()=>({appId:'456',providerAccountId:'100',scopes:['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'],expiresAt:new Date(Date.now()+86400000)})});
 const asset=await access.resolve(f.adminCtx,accountId,'messages.read');
 const sources={comment:{...asset.sourceRef!,sourceRecordId:comment.id,commentId:comment.providerId,mediaId:comment.mediaId},message:{...asset.sourceRef!,sourceRecordId:message.id,conversationId:message.conversationId,participantId:'300'}};
 const engagement=createInstagramManagementEngagement({db:f.db,access,policy,testRestriction:rule,graph:()=>({media:async()=>{reads++;return{items:[{id:comment.mediaId}],nextCursor:null};},replyComment:async()=>{sends++;return{status:'sent',providerId:'reply-comment'};},sendMessage:async()=>{sends++;return{status:'sent',providerId:'reply-message'};}} as any),isDeleted:async()=>false,verifiedCommentLimit:1000});
 const input=(kind:'comment'|'message',patch:any={})=>({asset,source:sources[kind],requestKey:randomUUID(),kind,targetId:kind==='comment'?comment.providerId:'300',text:recordingTexts[kind],...patch});
 return{rule,asset,sources,input,engagement,policy,calls:()=>({reads,sends})};
}

const new2Text='Social Scheduler Instagram reply test NEW2. This reply is for app review demonstration only.';
async function setupNew2(f:MetaInboxFixture){
 const s=await setup(f,true,true,true);
 const row=await f.db.instagramInteractionMessage.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'message-new2',actorId:'400',conversationId:'thread-new2',inbound:true,text:'SS-IG-DM-NEW2 Social Scheduler Instagram messaging review demo.',occurredAt:new Date()}});
 const rule=parseInstagramReplyRecording(JSON.stringify({...s.rule,messageNew2:{sourceRecordId:row.id,providerEventId:row.providerId,actorId:'400',conversationId:row.conversationId,expiresAt:new Date(+row.occurredAt+86400000).toISOString()}}))!;
 const source={...s.asset.sourceRef!,sourceRecordId:row.id,conversationId:row.conversationId,participantId:'400'};
 let sends=0,ownershipReads=0;
 const access=createInstagramManagementAccess({db:f.db,appId:'456',policy:s.policy,decrypt:v=>v,inspect:async()=>({appId:'456',providerAccountId:'100',scopes:['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'],expiresAt:new Date(Date.now()+86400000)})});
 const engagement=createInstagramManagementEngagement({db:f.db,access,policy:s.policy,testRestriction:rule,isDeleted:async()=>false,verifiedCommentLimit:1000,graph:()=>({conversation:async(id:string)=>{assert.equal(id,'thread-new2');ownershipReads++;return{id,participants:{data:[{id:'100',username:'mooyamcosmetic'},{id:'400',username:'zhizhangpeng'}]}};},sendMessage:async(id:string,text:string)=>{assert.equal(id,'400');assert.equal(text,new2Text);sends++;return{status:'sent',providerId:'new2-confirmed-reply'};}} as any)});
 const input={asset:s.asset,source,kind:'message' as const,targetId:'400',text:new2Text,requestKey:randomUUID()};
 return{...s,row,rule,source,engagement,input,counts:()=>({sends,ownershipReads})};
}

test('NEW2 whitelist uses normal ownership/send/receipt flow without historical pagination, while old records stay closed',async()=>withMetaInboxFixture(async f=>{
 const s=await setupNew2(f),before=await f.publishingSnapshot();
 const old=await f.db.instagramInteractionSendAttempt.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,requestKey:randomUUID(),targetHash:createHash('sha256').update(JSON.stringify(['message','300'])).digest('hex'),payloadHash:createHash('sha256').update(JSON.stringify(recordingTexts.message)).digest('hex'),status:'sent',providerId:'old-confirmed'}});
 const detail=await s.engagement.detail(s.asset,s.source);assert.equal(detail.recordingReply?.state,'available');assert.equal(detail.recordingReply?.text,new2Text);assert.equal(detail.recordingReply?.expiresAt,new Date(+s.row.occurredAt+86400000).toISOString());
 for(const source of [s.sources.message,s.sources.comment,{...s.sources.message,sourceRecordId:s.rule.messageRec2!.sourceRecordId}])await assert.rejects(s.engagement.reply(s.asset,source,new2Text,randomUUID()));
 assert.equal((await s.engagement.reply(s.asset,s.source,new2Text,randomUUID())).status,'sent');
 await s.engagement.reply(s.asset,s.source,new2Text,randomUUID());assert.equal(s.counts().sends,1);assert.ok(s.counts().ownershipReads>=1);
 const after=await s.engagement.detail(s.asset,s.source);assert.equal(after.recordingReply?.state,'used');assert.equal(after.items.filter(v=>!v.inbound&&v.text===new2Text).length,1);
 assert.deepEqual(await f.db.instagramInteractionSendAttempt.findUnique({where:{id:old.id}}),old);assert.deepEqual(await f.publishingSnapshot(),before);
 const c=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:s.rule.connectionId}});assert.equal(c.notificationsEnabled,false);assert.equal(s.rule.messageRec3,undefined);
}));

test('NEW2 identity, text, account, role, permission and marker substitutions fail without consuming attempts',async()=>withMetaInboxFixture(async f=>{
 const s=await setupNew2(f),executor=createInstagramSendExecutor({db:f.db,testRestriction:s.rule});let sends=0;const send=async()=>{sends++;return{status:'sent' as const,providerId:'bad'};};
 for(const patch of [{text:recordingTexts.message},{targetId:'300'},{source:{...s.source,sourceRecordId:randomUUID()}},{source:{...s.source,participantId:'300'}},{source:{...s.source,conversationId:'other'}},{asset:{...s.asset,ctx:f.viewerCtx}},{asset:{...s.asset,connectionVersion:2}},{asset:{...s.asset,accountId:f.instagramAccountIds[1]}}])await assert.rejects(executor.execute({...s.input,...patch},send));
 await f.db.instagramInteractionMessage.update({where:{id:s.row.id},data:{text:'SS-IG-DM-NEW20 not the selected test'}});await assert.rejects(executor.execute(s.input,send));
 await f.db.instagramInteractionMessage.update({where:{id:s.row.id},data:{text:s.row.text}});await f.db.instagramManagementConnection.update({where:{id:s.rule.connectionId},data:{scopes:['instagram_business_basic']}});await assert.rejects(executor.execute(s.input,send));
 assert.equal(sends,0);assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{connectionId:s.rule.connectionId}}),0);
}));

test('NEW2 cannot extend the original 24-hour deadline or re-arm by replacing configuration',async()=>withMetaInboxFixture(async f=>{
 const s=await setupNew2(f);let sends=0;const send=async()=>{sends++;return{status:'sent' as const,providerId:'bad'};};
 const boundary=new Date(+s.row.occurredAt+86400000),extended={...s.rule,messageNew2:{...s.rule.messageNew2!,expiresAt:new Date(+boundary+86400000).toISOString()}};
 await assert.rejects(createInstagramSendExecutor({db:f.db,testRestriction:extended,now:()=>boundary}).execute(s.input,send));
 const expired={...s.rule,messageNew2:{...s.rule.messageNew2!,expiresAt:new Date(Date.now()-1000).toISOString()}};
 await assert.rejects(createInstagramSendExecutor({db:f.db,testRestriction:expired}).execute(s.input,send));
 await f.db.instagramInteractionMessage.update({where:{id:s.row.id},data:{occurredAt:new Date(Date.now()+60000)}});await assert.rejects(createInstagramSendExecutor({db:f.db,testRestriction:s.rule}).execute(s.input,send));
 assert.equal(sends,0);assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{connectionId:s.rule.connectionId}}),0);
}));

for(const status of ['sent','failed','unknown','throw'] as const)test(`NEW2 ${status} remains consumed across request keys and executor recreation`,async()=>withMetaInboxFixture(async f=>{
 const s=await setupNew2(f);let sends=0;const executor=()=>createInstagramSendExecutor({db:f.db,testRestriction:s.rule});
 await executor().execute(s.input,async()=>{sends++;if(status==='throw')throw Error('synthetic transport');return status==='sent'?{status,providerId:'one-reply'}:status==='failed'?{status,code:'denied',diagnosticId:randomUUID()}:{status,diagnosticId:randomUUID()};});
 await executor().execute({...s.input,requestKey:randomUUID()},async()=>{sends++;return{status:'sent',providerId:'duplicate'};});assert.equal(sends,1);
}));

test('NEW2 concurrent different request keys dispatch at most once',async()=>withMetaInboxFixture(async f=>{
 const s=await setupNew2(f);let calls=0,release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),waiting=new Promise<void>(r=>started=r),executor=()=>createInstagramSendExecutor({db:f.db,testRestriction:s.rule});
 const first=executor().execute(s.input,async()=>{calls++;started();await gate;return{status:'sent',providerId:'once'};});await waiting;
 try{assert.equal((await executor().execute({...s.input,requestKey:randomUUID()},async()=>{calls++;return{status:'sent',providerId:'duplicate'};})).status,'unknown');}finally{release();}
 assert.equal((await first).status,'sent');assert.equal(calls,1);
}));

test('NEW2 detail advertises the original 24-hour deadline even when configured expiry is later',async()=>withMetaInboxFixture(async f=>{
 const s=await setupNew2(f),at=new Date(Date.now()-3600000);
 await f.db.instagramInteractionMessage.update({where:{id:s.row.id},data:{occurredAt:at}});
 const detail=await s.engagement.detail(s.asset,s.source);
 assert.equal(detail.recordingReply?.expiresAt,new Date(+at+86400000).toISOString());
 assert.equal(detail.recordingReply?.state,'available');
 assert.equal(s.counts().sends,0);
}));

test('NEW2 does not reopen a configured REC3 or change its existing grant',async()=>withMetaInboxFixture(async f=>{
 const s=await setupNew2(f),row=await f.db.instagramInteractionMessage.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'old-rec3',actorId:'300',conversationId:s.rule.message.conversationId,inbound:true,text:'SS-IG-DM-1023-REC3 older test',occurredAt:new Date()}});
 const grant=await f.db.instagramReplyRecordingGrant.create({data:{workspaceId:s.rule.workspaceId,appId:'456',incomingKey:'a'.repeat(64),connectionId:s.rule.connectionId,sourceRecordId:row.id,occurredAt:row.occurredAt,expiresAt:new Date(Date.now()+60000),forgetAfter:new Date(Date.now()+86400000),state:'closed'}});
 const rule=parseInstagramReplyRecording(JSON.stringify({...s.rule,messageRec3:{sourceRecordId:row.id,providerEventId:row.providerId,actorId:'300',conversationId:row.conversationId,expiresAt:new Date(Date.now()+60000).toISOString()}}))!;
 const executor=createInstagramSendExecutor({db:f.db,testRestriction:rule});let calls=0;
 await assert.rejects(executor.execute({...s.input,source:{...s.sources.message,sourceRecordId:row.id},targetId:'300',text:'Social Scheduler Instagram messaging reply test REC3. This reply is for app review demonstration only.'},async()=>{calls++;throw Error('REC3 stays closed');}));
 await executor.execute(s.input,async()=>{calls++;return{status:'sent',providerId:'new2-only'};});assert.equal(calls,1);
 assert.deepEqual(await f.db.instagramReplyRecordingGrant.findUnique({where:{id:grant.id}}),grant);
}));

test('replacing a consumed NEW2 source for the same actor cannot restore its slot',async()=>withMetaInboxFixture(async f=>{
 const s=await setupNew2(f);let sends=0;const send=async()=>{sends++;return{status:'sent' as const,providerId:'first-only'};};
 await createInstagramSendExecutor({db:f.db,testRestriction:s.rule}).execute(s.input,send);
 const old=await f.db.instagramInteractionSendAttempt.findMany({where:{connectionId:s.rule.connectionId}});
 const next=await f.db.instagramInteractionMessage.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'replacement-new2',actorId:'400',conversationId:s.row.conversationId,inbound:true,text:s.row.text,occurredAt:new Date()}});
 const rule=parseInstagramReplyRecording(JSON.stringify({...s.rule,messageNew2:{...s.rule.messageNew2!,sourceRecordId:next.id,providerEventId:next.providerId,expiresAt:new Date(Date.now()+86400000).toISOString()}}))!;
 const result=await createInstagramSendExecutor({db:f.db,testRestriction:rule}).execute({...s.input,source:{...s.source,sourceRecordId:next.id},requestKey:randomUUID()},send);
 assert.deepEqual(result,{status:'sent',providerId:'first-only',replayed:true});assert.equal(sends,1);
 assert.deepEqual(await f.db.instagramInteractionSendAttempt.findUnique({where:{id:old[0].id}}),old[0]);
}));

test('NEW2 expired detail disables reply capability without a send or reset',async()=>withMetaInboxFixture(async f=>{
 const s=await setupNew2(f);
 await f.db.instagramInteractionMessage.update({where:{id:s.row.id},data:{occurredAt:new Date(Date.now()-86400000-1000)}});
 // Retention already forbids this old source; it must not expose a sendable detail.
 await assert.rejects(s.engagement.detail(s.asset,s.source));
 assert.equal(s.counts().sends,0);assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{connectionId:s.rule.connectionId}}),0);
}));

test('recording config is absent by default and malformed configuration fails closed without leaking input',()=>{
 assert.equal(parseInstagramReplyRecording(undefined),null);
 for(const value of ['', 'null','[]','{}','{"enabled":false,"secret":"private"}'])assert.throws(()=>parseInstagramReplyRecording(value),e=>e instanceof Error&&e.message==='Invalid Instagram reply recording configuration');
});
test('REC2 alone is manually replyable once while old REC1 evidence stays readable and attempts unchanged',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f,true,true),next=(s.rule as any).commentRec2;
 const source={...s.sources.comment,sourceRecordId:next.sourceRecordId,commentId:next.providerEventId};
 const text='Social Scheduler Instagram comment reply test REC2. This reply is for app review demonstration only.';
 const oldAttempt=await f.db.instagramInteractionSendAttempt.create({data:{workspaceId:f.adminCtx.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,requestKey:randomUUID(),targetHash:createHash('sha256').update(JSON.stringify(['comment',s.rule.comment.providerEventId])).digest('hex'),payloadHash:createHash('sha256').update(JSON.stringify(recordingTexts.comment)).digest('hex'),status:'sent',providerId:'old-rec1-reply',diagnosticId:randomUUID()}});
 const before=await f.publishingSnapshot();
 assert.equal((await s.engagement.detail(s.asset,source)).recordingReply?.text,text);
 await assert.rejects(s.engagement.reply(s.asset,s.sources.comment,recordingTexts.comment,randomUUID()));
 await assert.rejects(s.engagement.reply(s.asset,s.sources.message,recordingTexts.message,randomUUID()));
 await assert.rejects(s.engagement.reply(s.asset,source,recordingTexts.comment,randomUUID()));
 assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{workspaceId:f.adminCtx.workspaceId}}),1);
 assert.equal((await s.engagement.reply(s.asset,source,text,randomUUID())).status,'sent');
 assert.equal((await s.engagement.detail(s.asset,source)).recordingReply?.state,'used');
 assert.ok((await s.engagement.detail(s.asset,source)).items.some(v=>v.text===text&&!v.inbound));
 await s.engagement.reply(s.asset,source,text,randomUUID());assert.equal(s.calls().sends,1);
 assert.equal((await s.engagement.detail(s.asset,s.sources.comment)).items[0].text,'SS-IG-C-1022-REC1 review demo');
 assert.ok((await s.engagement.detail(s.asset,s.sources.comment)).items.some(v=>v.id==='old-rec1-reply'&&v.text===recordingTexts.comment));
 assert.deepEqual(await f.db.instagramInteractionSendAttempt.findUnique({where:{id:oldAttempt.id}}),oldAttempt);
 assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('REC2 expiry and marker or media substitution cannot claim its single attempt',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f,true,true),r=s.rule.commentRec2!,text='Social Scheduler Instagram comment reply test REC2. This reply is for app review demonstration only.';
 const source={...s.sources.comment,sourceRecordId:r.sourceRecordId,commentId:r.providerEventId};
 const input={...s.input('comment'),source,targetId:r.providerEventId,text};let sends=0;
 const send=async()=>{sends++;return{status:'sent' as const,providerId:'bad'};};
 const expired={...s.rule,commentRec2:{...r,expiresAt:new Date(Date.now()-1000).toISOString()}};
 await assert.rejects(createInstagramSendExecutor({db:f.db,testRestriction:expired}).execute(input,send));
 await assert.rejects(createInstagramSendExecutor({db:f.db,testRestriction:s.rule}).execute({...input,source:{...source,mediaId:'wrong-media'}},send));
 await f.db.instagramInteractionComment.update({where:{id:r.sourceRecordId},data:{text:'SS-IG-C-1023-REC20 not REC2'}});
 await assert.rejects(createInstagramSendExecutor({db:f.db,testRestriction:s.rule}).execute(input,send));
 assert.equal(sends,0);assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
}));

test('DM REC2 alone has fixed manual text, one dispatch and reload echo without reopening any comment or old message',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f,true,true,true),r=(s.rule as any).messageRec2,source={...s.sources.message,sourceRecordId:r.sourceRecordId},text='Social Scheduler Instagram messaging reply test REC2. This reply is for app review demonstration only.';
 const detail=await s.engagement.detail(s.asset,source);assert.equal(detail.recordingReply?.text,text);assert.equal(detail.recordingReply?.state,'available');assert.equal(s.calls().sends,0);
 const executor=createInstagramSendExecutor({db:f.db,testRestriction:s.rule});let calls=0;
 const input={...s.input('message'),source,text};
 const expired={...s.rule,messageRec2:{...r,expiresAt:new Date(Date.now()-1000).toISOString()}};
 await assert.rejects(createInstagramSendExecutor({db:f.db,testRestriction:expired}).execute(input,async()=>{calls++;throw Error('expired');}));
 await assert.rejects(executor.execute({...input,source:{...source,conversationId:'wrong-conversation'}},async()=>{calls++;throw Error('wrong conversation');}));assert.equal(calls,0);
 for(const bad of [{...input,source:s.sources.message},{...input,text:recordingTexts.message},{...input,source:{...source,participantId:'301'}},{...s.input('comment')},{...s.input('comment'),source:{...s.sources.comment,sourceRecordId:s.rule.commentRec2!.sourceRecordId,commentId:s.rule.commentRec2!.providerEventId},text:'Social Scheduler Instagram comment reply test REC2. This reply is for app review demonstration only.'}])await assert.rejects(executor.execute(bad,async()=>{throw Error('no dispatch');}));
 assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{connectionId:s.rule.connectionId}}),0);
 assert.equal((await executor.execute(input,async()=>{calls++;return{status:'sent',providerId:'dm-rec2-reply'};})).status,'sent');
 await executor.execute({...input,requestKey:randomUUID()},async()=>{calls++;throw Error('duplicate');});assert.equal(calls,1);
 const after=await s.engagement.detail(s.asset,source);assert.equal(after.recordingReply?.state,'used');assert.ok(after.items.some(v=>v.id==='dm-rec2-reply'&&!v.inbound&&v.text===text));
}));

test('a new DM REC2 never resets a prior failed conversation attempt',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f,true,true,true),r=(s.rule as any).messageRec2,source={...s.sources.message,sourceRecordId:r.sourceRecordId},text='Social Scheduler Instagram messaging reply test REC2. This reply is for app review demonstration only.';
 const old=await f.db.instagramInteractionSendAttempt.create({data:{workspaceId:f.adminCtx.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,requestKey:randomUUID(),targetHash:createHash('sha256').update(JSON.stringify(['message','300'])).digest('hex'),payloadHash:createHash('sha256').update(JSON.stringify(recordingTexts.message)).digest('hex'),status:'failed',diagnosticId:randomUUID()}});
 assert.equal((await s.engagement.detail(s.asset,source)).recordingReply?.state,'used');
 let calls=0;await createInstagramSendExecutor({db:f.db,testRestriction:s.rule}).execute({...s.input('message'),source,text},async()=>{calls++;throw Error('must not dispatch');});assert.equal(calls,0);
 assert.deepEqual(await f.db.instagramInteractionSendAttempt.findUnique({where:{id:old.id}}),old);
}));

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

for(const kind of ['comment','message'] as const)test(`confirmed ${kind} REC1 receipt is visible after reload without resending or writing cached bodies`,async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),executor=createInstagramSendExecutor({db:f.db,testRestriction:s.rule});
 await executor.execute(s.input(kind),async()=>({status:'sent',providerId:'existing-'+kind+'-receipt'}));
 const before=await f.db.instagramInteractionSendAttempt.findMany({where:{connectionId:s.rule.connectionId}}),rawBefore=await f.db[kind==='comment'?'instagramInteractionComment':'instagramInteractionMessage'].count(),publishing=await f.publishingSnapshot();
 const first=await s.engagement.detail(s.asset,s.sources[kind]),second=await s.engagement.detail(s.asset,s.sources[kind]);
 const replies=first.items.filter(v=>!v.inbound);assert.equal(replies.length,1);assert.equal(replies[0].id,'existing-'+kind+'-receipt');assert.equal(replies[0].text,kind==='comment'?'Social Scheduler Instagram comment reply test REC1. This reply is for app review demonstration only.':'Social Scheduler Instagram messaging reply test REC1. This reply is for app review demonstration only.');
 assert.deepEqual(second.items,first.items);assert.equal(first.recordingReply?.state,'used');assert.ok(first.items[0].inbound);assert.deepEqual(s.calls(),{reads:0,sends:0});
 assert.deepEqual(await f.db.instagramInteractionSendAttempt.findMany({where:{connectionId:s.rule.connectionId}}),before);assert.equal(await f.db[kind==='comment'?'instagramInteractionComment':'instagramInteractionMessage'].count(),rawBefore);assert.deepEqual(await f.publishingSnapshot(),publishing);
}));

test('REC1 echo never invents text for failed, unknown, wrong payload, epoch or target receipts',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 const add=(patch:any)=>f.db.instagramInteractionSendAttempt.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,requestKey:randomUUID(),targetHash:hash(['comment',s.rule.comment.providerEventId]),payloadHash:hash(recordingTexts.comment),status:'sent',providerId:randomUUID(),...patch}});
 for(const patch of [{status:'pending'},{status:'unknown'},{status:'failed'},{providerId:null},{connectionVersion:2},{targetHash:hash(['comment','other'])},{payloadHash:hash('Different text')}])await add(patch);
 assert.equal((await s.engagement.detail(s.asset,s.sources.comment)).items.filter(v=>!v.inbound).length,0);
 assert.equal(s.calls().sends,0);
}));

test('recording message receipt is not duplicated when its verified cached body already exists',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f);await createInstagramSendExecutor({db:f.db,testRestriction:s.rule}).execute(s.input('message'),async()=>({status:'sent',providerId:'echo-message'}));
 await f.db.instagramInteractionMessage.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'echo-message',conversationId:s.rule.message.conversationId,actorId:'300',inbound:false,text:recordingTexts.message,occurredAt:new Date()}});
 const detail=await s.engagement.detail(s.asset,s.sources.message);assert.equal(detail.items.filter(v=>v.id==='echo-message').length,1);
}));

for(const kind of ['comment','message'] as const)test(`Instagram ${kind} replied state requires current original receipt, not a copied reply after a new inbound`,async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),before=await f.publishingSnapshot(),base=Date.now()-120000,hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 if(kind==='comment')await f.db.instagramInteractionComment.update({where:{id:s.rule.comment.sourceRecordId},data:{occurredAt:new Date(base)}});
 else await f.db.instagramInteractionMessage.update({where:{id:s.rule.message.sourceRecordId},data:{occurredAt:new Date(base)}});
 const access=createInboxAccess({db:f.db,facebookEnabled:false,instagram:{enabled:true,access:createInstagramManagementAccess({db:f.db,appId:'456',policy:s.policy,decrypt:v=>v,inspect:async()=>({appId:'456',providerAccountId:'100',scopes:['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'],expiresAt:new Date(Date.now()+86400000)})})},policy:s.policy,verifyFacebook:async()=>{throw Error('not Facebook');}});
 const projection=createInboxProjection({db:f.db,access,policy:s.policy}),items=await s.engagement.normalizeVerifiedEvent([s.rule[kind].sourceRecordId],s.asset);await projection.projectVerifiedPage(f.adminCtx,s.asset,{items,nextCursor:null,coverage:'verified_selected_sources',warnings:[]});
 const c=await f.db.interactionCase.findFirstOrThrow({where:{workspaceId:s.rule.workspaceId,kind:kind==='comment'?'comments':'messages'}});await f.db.interactionCase.update({where:{id:c.id},data:{lastInboundAt:new Date(base)}});
 const add=(patch:any={})=>f.db.instagramInteractionSendAttempt.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,requestKey:randomUUID(),targetHash:hash([kind,kind==='comment'?s.rule.comment.providerEventId:'300']),payloadHash:hash(recordingTexts[kind]),status:'unknown',providerId:null,createdAt:new Date(base+10000),...patch}});
 const badge=(at?:Date)=>presentInboxCase(f.db,f.adminCtx,c.id,s.asset.accountId,at).then(v=>v.replied);
 const receipt=await add();assert.equal(await badge(),false);
 await f.db.instagramInteractionSendAttempt.update({where:{id:receipt.id},data:{status:'sent',providerId:'original-'+kind}});assert.equal(await badge(),true);
 await f.db.interactionCase.update({where:{id:c.id},data:{lastInboundAt:null}});assert.equal(await badge(),true,'epoch-reconciled cases with no indexed inbound still use the verified source time');
 assert.equal(await badge(new Date(base+20000)),false);
 await f.db.interactionCase.update({where:{id:c.id},data:{lastInboundAt:new Date(base+20000)}});await add({status:'sent',providerId:'original-'+kind,createdAt:new Date(base+30000)});assert.equal(await badge(),false);
 await add({status:'sent',providerId:'wrong-target',targetHash:hash([kind,'other']),createdAt:new Date(base+40000)});await add({status:'sent',providerId:'old-version',connectionVersion:2,createdAt:new Date(base+40000)});assert.equal(await badge(),false);
 await add({status:'sent',providerId:'new-original-'+kind,createdAt:new Date(base+50000)});assert.equal(await badge(),true);
 if(kind==='message'){await f.db.instagramInteractionMessage.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'new-unprojected-inbound',conversationId:s.rule.message.conversationId,actorId:'300',inbound:true,text:'A newer customer message',occurredAt:new Date(base+60000)}});assert.equal(await badge(),false,'a newer cached inbound clears the badge before projection catches up');}
 await f.db.instagramManagementConnection.update({where:{id:s.rule.connectionId},data:{status:'authorization_invalid'}});assert.equal(await badge(),false);assert.deepEqual(await f.publishingSnapshot(),before);
}));

for(const kind of ['comment','message'] as const)test(`a locally deleted ${kind} reply is never resurrected from its successful receipt`,async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f);await createInstagramSendExecutor({db:f.db,testRestriction:s.rule}).execute(s.input(kind),async()=>({status:'sent',providerId:'deleted-reply'}));
 const common={workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'deleted-reply',inbound:false,text:null,deleted:true,occurredAt:new Date()};
 if(kind==='message')await f.db.instagramInteractionMessage.create({data:{...common,actorId:'300',conversationId:s.rule.message.conversationId}});
 else await f.db.instagramInteractionComment.create({data:{...common,actorId:'100',mediaId:s.rule.comment.mediaId,parentId:s.rule.comment.providerEventId}});
 assert.equal((await s.engagement.detail(s.asset,s.sources[kind])).items.filter(v=>v.id==='deleted-reply').length,0);
}));

test('cached verified comment reply content takes precedence over a receipt echo',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f);await createInstagramSendExecutor({db:f.db,testRestriction:s.rule}).execute(s.input('comment'),async()=>({status:'sent',providerId:'cached-comment-reply'}));
 await f.db.instagramInteractionComment.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'cached-comment-reply',actorId:'100',mediaId:s.rule.comment.mediaId,parentId:s.rule.comment.providerEventId,inbound:false,text:'Verified updated reply text',occurredAt:new Date()}});
 const rows=(await s.engagement.detail(s.asset,s.sources.comment)).items.filter(v=>v.id==='cached-comment-reply');assert.equal(rows.length,1);assert.equal(rows[0].text,'Verified updated reply text');
}));

test('retention of a scrubbed original cannot promote its surviving copied receipt to a new reply',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),base=Date.now();
 await f.db.instagramInteractionMessage.update({where:{id:s.rule.message.sourceRecordId},data:{occurredAt:new Date(base-12*3600000)}});
 const access=createInboxAccess({db:f.db,facebookEnabled:false,instagram:{enabled:true,access:createInstagramManagementAccess({db:f.db,appId:'456',policy:s.policy,decrypt:v=>v,inspect:async()=>({appId:'456',providerAccountId:'100',scopes:['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'],expiresAt:new Date(Date.now()+86400000)})})},policy:s.policy,verifyFacebook:async()=>{throw Error('not Facebook');}}),projection=createInboxProjection({db:f.db,access,policy:s.policy});
 await projection.projectVerifiedPage(f.adminCtx,s.asset,{items:await s.engagement.normalizeVerifiedEvent([s.rule.message.sourceRecordId],s.asset),nextCursor:null,coverage:'verified_selected_sources',warnings:[]});
 const c=await f.db.interactionCase.findFirstOrThrow({where:{workspaceId:s.rule.workspaceId,kind:'messages'}});
 for(const age of [36,1])await f.db.instagramInteractionSendAttempt.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,requestKey:randomUUID(),targetHash:hash(['message','300']),payloadHash:hash(recordingTexts.message),status:'sent',providerId:'retained-copy',createdAt:new Date(base-age*3600000)}});
 assert.equal((await presentInboxCase(f.db,f.adminCtx,c.id,s.asset.accountId)).replied,false);
 assert.equal(await createMetaSourceRetention({db:f.db,policy:s.policy}).pruneInstagram({workspaceId:s.rule.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',connectionId:s.rule.connectionId,connectionVersion:1},new Date(),50,'sends'),1);
 assert.equal((await presentInboxCase(f.db,f.adminCtx,c.id,s.asset.accountId)).replied,false);
 assert.equal((await s.engagement.detail(s.asset,s.sources.message)).items.filter(v=>!v.inbound).length,0);
}));

test('a fresh original send remains visible after unrelated historical receipts were scrubbed',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f);
 await f.db.instagramInteractionSendAttempt.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,requestKey:randomUUID(),targetHash:'deleted',payloadHash:'deleted',status:'unknown',createdAt:new Date(Date.now()-2*86400000)}});
 assert.equal((await s.engagement.reply(s.asset,s.sources.comment,recordingTexts.comment,randomUUID())).status,'sent');
 assert.equal((await s.engagement.detail(s.asset,s.sources.comment)).items.filter(v=>!v.inbound).length,1);
 const proof=await f.db.interactionAudit.findMany({where:{workspaceId:s.rule.workspaceId,action:'instagram.reply.original'}});assert.equal(proof.length,1);assert.doesNotMatch(JSON.stringify(proof),/Social Scheduler|sealed:|publishing-original/);
 await s.engagement.reply(s.asset,s.sources.comment,recordingTexts.comment,randomUUID());assert.equal(await f.db.interactionAudit.count({where:{workspaceId:s.rule.workspaceId,action:'instagram.reply.original'}}),1);assert.equal(s.calls().sends,1);
}));
