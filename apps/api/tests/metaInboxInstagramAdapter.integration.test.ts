import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {withMetaInboxFixture,type MetaInboxFixture} from './helpers/metaInboxFixture';
import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';
import {createInstagramManagementAccess} from '../src/instagramManagement/access';
import {createInstagramManagementEngagement} from '../src/instagramManagement/engagement';
import {createInstagramInboxAdapter} from '../src/interactionInbox/adapters/instagram';
import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';
import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
async function setup(f:MetaInboxFixture,graph:any={},options:{now?:()=>Date;window?:number;days?:number;isDeleted?:any}={}){
 const scopes=['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'];
 const policy=createLiveInboxPolicy([{workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',readEnabled:true,sendEnabled:true,policy:{product:'synthetic-test-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:options.days??90,replyWindowMs:options.window??86400000,reviewed:true}}]);
 const access=createInstagramManagementAccess({db:f.db,appId:'456',policy,decrypt:v=>v,inspect:async()=>({appId:'456',providerAccountId:'100',scopes,expiresAt:new Date(Date.now()+86400000)})});
 const engagement=createInstagramManagementEngagement({db:f.db,access,policy,graph:(_asset:any,token:string)=>{assert.equal(token,'sealed:independent');return graph;},isDeleted:options.isDeleted??(async()=>false),verifiedCommentLimit:1000,now:options.now});
 const adapter=createInstagramInboxAdapter({db:f.db,access,engagement,policy});
 const asset=await access.resolve(f.adminCtx,f.instagramAccountIds[0],'messages.read');
 const message=await f.db.instagramInteractionMessage.create({data:{workspaceId:f.adminCtx.workspaceId,connectionId:f.instagramConnectionIds[0],connectionVersion:1,providerId:'mid-1',conversationId:'local:test-thread',actorId:'300',inbound:true,text:'Synthetic incoming',occurredAt:options.now?.()??new Date()}});
 const source={...asset.sourceRef!,sourceRecordId:message.id,conversationId:message.conversationId,participantId:'300'};
 return{adapter,asset,source,message};
}

test('freshInstagramRootDoesNotExposeExpiredOrFutureSiblingBodies',async()=>withMetaInboxFixture(async f=>{
 const clock=new Date(),{adapter,asset,source,message}=await setup(f,{}, {days:1,now:()=>clock});
 await f.db.instagramInteractionMessage.update({where:{id:message.id},data:{occurredAt:clock,receivedAt:clock}});
 for(const [id,at] of [['expired',new Date(clock.getTime()-2*86400000)],['future',new Date(clock.getTime()+1000)],['unknown',new Date(0)]] as const)await f.db.instagramInteractionMessage.create({data:{workspaceId:f.adminCtx.workspaceId,connectionId:f.instagramConnectionIds[0],connectionVersion:1,providerId:id,conversationId:message.conversationId,actorId:'300',inbound:true,text:'Must not serialize '+id,occurredAt:at,receivedAt:clock}});
 const detail=await adapter.detail(asset,source);assert.deepEqual(detail.items.map(v=>v.id),['mid-1']);
}));
test('foreignConversationCannotBeRepliedTo',async()=>withMetaInboxFixture(async f=>{
 let sends=0;const {adapter,asset,source}=await setup(f,{sendMessage:async()=>{sends++;return{status:'sent',providerId:'bad'};}});
 for(const patch of [{participantId:'301'},{conversationId:'foreign-thread'},{connectionId:f.instagramConnectionIds[1]},{sourceRecordId:randomUUID()}])await assert.rejects(adapter.reply(asset,{...source,...patch},'Reply',randomUUID()));assert.equal(sends,0);
}));
test('scopeMissingNeverFetches',async()=>withMetaInboxFixture(async f=>{
 let sends=0;const {adapter,asset,source}=await setup(f,{sendMessage:async()=>{sends++;return{status:'sent',providerId:'bad'};}});
 await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{scopes:['instagram_business_basic']}});
 await assert.rejects(adapter.reply(asset,source,'Reply',randomUUID()));assert.equal(sends,0);
}));
test('replyWindowCheckedAtSendNotLoad',async()=>withMetaInboxFixture(async f=>{
 let clock=new Date(),sends=0;const {adapter,asset,source}=await setup(f,{sendMessage:async()=>{sends++;return{status:'sent',providerId:'bad'};}},{now:()=>clock,window:1000});
 const detail=await adapter.detail(asset,source);assert.equal(detail.items[0].text,'Synthetic incoming');clock=new Date(clock.getTime()+2000);
 await assert.rejects(adapter.reply(asset,source,'Reply',randomUUID()));assert.equal(sends,0);
}));
test('revokedBetweenLookupAndSendDenied',async()=>withMetaInboxFixture(async f=>{
 let sends=0;const {adapter,asset,source,message}=await setup(f,{conversation:async()=>{
  await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{version:{increment:1},status:'inactive'}});
  return{id:'remote-thread',participants:{data:[{id:'100'},{id:'300'}]}};
 },sendMessage:async()=>{sends++;return{status:'sent',providerId:'bad'};}});
 await f.db.instagramInteractionMessage.update({where:{id:message.id},data:{conversationId:'remote-thread'}});
 await assert.rejects(adapter.reply(asset,{...source,conversationId:'remote-thread'},'Reply',randomUUID()));assert.equal(sends,0);
}));
test('signedSourceReplyAndReadKeepPublishingUntouchedAndBodiesOutOfProjection',async()=>withMetaInboxFixture(async f=>{
 const before=await f.publishingSnapshot();let sends=0;const {adapter,asset,source,message}=await setup(f,{sendMessage:async(recipient:string,text:string)=>{assert.equal(recipient,'300');assert.equal(text,'Reply');sends++;return{status:'sent',providerId:'sent-1'};}});
 const normalized=await adapter.normalizeVerifiedEvent([message.id],asset);assert.equal(normalized.length,1);assert.equal(normalized[0].sourceRef.sourceRecordId,message.id);assert.equal(normalized[0].text,undefined);
 const key=randomUUID();assert.deepEqual(await adapter.reply(asset,source,'Reply',key),{status:'sent',providerId:'sent-1'});assert.deepEqual(await adapter.reply(asset,source,'Reply',key),{status:'sent',providerId:'sent-1'});assert.equal(sends,1);
 assert.deepEqual(await f.publishingSnapshot(),before);await assert.rejects(adapter.normalizeVerifiedEvent(Array.from({length:51},()=>message.id),asset));
}));
test('remoteReadProjectsOnlyVerifiedOwnConversationAndStoresBodyOnce',async()=>withMetaInboxFixture(async f=>{
 const calls:string[]=[];const graph={conversations:async()=>({items:[{id:'thread-1',participants:{data:[{id:'100'},{id:'300'}]}}],nextCursor:null}),conversation:async(id:string)=>{calls.push(id);return{id,participants:{data:[{id:'100'},{id:'300'}]}};},messages:async(id:string)=>{assert.equal(id,'thread-1');return{items:[{id:'remote-mid',message:'Private incoming body',created_time:new Date().toISOString(),from:{id:'300'},to:{data:[{id:'100'}]}}],nextCursor:null};}};
 const {adapter,asset}=await setup(f,graph),before=await f.publishingSnapshot();const page=await adapter.list(asset,'messages',null,25);assert.equal(page.items.length,1);assert.equal(page.items[0].providerEventId,'remote-mid');assert.equal(page.items[0].text,undefined);assert.equal(calls[0],'thread-1');assert.doesNotMatch(JSON.stringify(page),/Private incoming body/);
 const detail=await adapter.detail(asset,page.items[0].sourceRef);assert.equal(detail.items.find(v=>v.id==='remote-mid')?.text,'Private incoming body');assert.equal(detail.items.find(v=>v.id==='mid-1')?.text,'Synthetic incoming');await adapter.list(asset,'messages',null,25);
 assert.equal(await f.db.instagramInteractionMessage.count({where:{connectionId:f.instagramConnectionIds[0],providerId:'remote-mid'}}),1);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('foreignRemoteThreadAndRevocationDuringReadNeverPersist',async()=>withMetaInboxFixture(async f=>{
 let mode='foreign',reads=0;const graph={conversations:async()=>({items:[{id:'foreign',participants:{data:[{id:'999'},{id:'300'}]}}],nextCursor:null}),conversation:async()=>{if(mode==='revoke')await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{status:'inactive'}});return{id:'foreign',participants:{data:[{id:mode==='foreign'?'999':'100'},{id:'300'}]}};},messages:async()=>{reads++;return{items:[{id:'should-not-exist',message:'No persistence',created_time:new Date().toISOString(),from:{id:'300'},to:{data:[{id:'100'}]}}],nextCursor:null};}};
 const {adapter,asset}=await setup(f,graph);await assert.rejects(adapter.list(asset,'messages',null,25));assert.equal(reads,0);mode='revoke';await assert.rejects(adapter.list(asset,'messages',null,25));assert.equal(await f.db.instagramInteractionMessage.count({where:{connectionId:f.instagramConnectionIds[0],providerId:'should-not-exist'}}),0);
}));
test('commentReadAndReplyAreBoundToSelectedAccountsMedia',async()=>withMetaInboxFixture(async f=>{
 let replies=0;const graph={media:async()=>({items:[{id:'media-own'}],nextCursor:null}),comments:async(id:string)=>{assert.equal(id,'media-own');return{items:[{id:'comment-own',text:'Question',timestamp:new Date().toISOString(),from:{id:'300'},username:'Synthetic visitor'}],nextCursor:null};},replyComment:async(id:string,text:string)=>{assert.equal(id,'comment-own');assert.equal(text,'Answer');replies++;return{status:'sent',providerId:'reply-own'};}};
 const {adapter,asset}=await setup(f,graph);const page=await adapter.list(asset,'comments',null,25);assert.equal(page.items.length,1);assert.equal((await adapter.detail(asset,page.items[0].sourceRef)).items[0].text,'Question');
 assert.deepEqual(await adapter.reply(asset,page.items[0].sourceRef,'Answer',randomUUID()),{status:'sent',providerId:'reply-own'});assert.equal(replies,1);
 await assert.rejects(adapter.reply(asset,{...page.items[0].sourceRef,mediaId:'foreign-media'},'Answer',randomUUID()));assert.equal(replies,1);await assert.rejects(adapter.reply(asset,page.items[0].sourceRef,'x'.repeat(1001),randomUUID()));
}));
test('messageOnlyGrantNormalizesMessagesWithoutRequiringComments',async()=>withMetaInboxFixture(async f=>{
 const {adapter,asset,message}=await setup(f);await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{scopes:['instagram_business_basic','instagram_business_manage_messages']}});
 assert.equal((await adapter.normalizeVerifiedEvent([message.id],asset)).length,1);
}));
test('wrongPlatformAssetCannotTriggerRemoteReads',async()=>withMetaInboxFixture(async f=>{
 let reads=0;const {adapter,asset}=await setup(f,{conversations:async()=>{reads++;return{items:[],nextCursor:null};}});
 await assert.rejects(adapter.list({...asset,platform:'facebook'},'messages',null,25));assert.equal(reads,0);
}));
test('paginationLimitDoesNotDropMessagesAndIsBoundToAsset',async()=>withMetaInboxFixture(async f=>{
 const thread={id:'thread-page',participants:{data:[{id:'100'},{id:'300'}]}},raw=[1,2,3].map(i=>({id:'page-'+i,message:'Body '+i,created_time:new Date(Date.now()-i*1000).toISOString(),from:{id:'300'},to:{data:[{id:'100'}]}}));
 const {adapter,asset}=await setup(f,{conversations:async()=>({items:[thread],nextCursor:null}),conversation:async()=>thread,messages:async()=>({items:raw,nextCursor:null})});
 let cursor:string|null=null;const ids:string[]=[];for(let i=0;i<3;i++){const page=await adapter.list(asset,'messages',cursor,1);assert.equal(page.items.length,1);ids.push(page.items[0].providerEventId);cursor=page.nextCursor;}
 assert.deepEqual(ids,['page-1','page-2','page-3']);assert.equal(cursor,null);
 const first=await adapter.list(asset,'messages',null,1);await assert.rejects(adapter.list({...asset,connectionVersion:2},'messages',first.nextCursor,1));
 const detail=await adapter.detail(asset,first.items[0].sourceRef);assert.deepEqual(new Set(detail.items.map(v=>v.id)),new Set(['mid-1','page-1','page-2','page-3']));
}));
test('commentOnlyGrantCanReadItsSendOutcome',async()=>withMetaInboxFixture(async f=>{
 const {adapter,asset}=await setup(f);await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{scopes:['instagram_business_basic','instagram_business_manage_comments']}});
 const key=randomUUID();await f.db.instagramInteractionSendAttempt.create({data:{workspaceId:f.adminCtx.workspaceId,connectionId:f.instagramConnectionIds[0],connectionVersion:1,requestKey:key,targetHash:'synthetic-only',payloadHash:'synthetic-only',status:'unknown',diagnosticId:randomUUID()}});
 assert.equal((await adapter.pendingSend!(asset,asset.sourceRef!,key,f.db))?.status,'unknown');
}));
test('verifiedBusinessUserAliasIsNotTreatedAsTheCustomer',async()=>withMetaInboxFixture(async f=>{
 const thread={id:'alias-thread',participants:{data:[{id:'200'},{id:'300'}]}};
 const {adapter,asset}=await setup(f,{conversations:async()=>({items:[thread],nextCursor:null}),conversation:async()=>thread,messages:async()=>({items:[{id:'alias-mid',message:'Alias recipient',created_time:new Date().toISOString(),from:{id:'300'},to:{data:[{id:'200'}]}}],nextCursor:null})});
 const page=await adapter.list(asset,'messages',null,25);assert.equal(page.items.length,1);assert.equal(page.items[0].actorId,'300');assert.equal(page.items[0].inbound,true);
}));
test('graphReadAlreadyInFlightCannotRecreateDeletedSource',async()=>withMetaInboxFixture(async f=>{
 const deletion=createMetaInboxDeletion({db:f.db,hmacKey:'synthetic-deletion-hmac-key-only',encrypt:encryptToken,decrypt:decryptToken});
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),waiting=new Promise<void>(r=>started=r),thread={id:'racing-thread',participants:{data:[{id:'100'},{id:'300'}]}};
 const {adapter,asset}=await setup(f,{conversations:async()=>({items:[thread],nextCursor:null}),conversation:async()=>thread,messages:async()=>{started();await gate;return{items:[{id:'deleted-in-flight',message:'Must never be reinserted',created_time:new Date().toISOString(),from:{id:'300'},to:{data:[{id:'100'}]}}],nextCursor:null};}},{isDeleted:(tx:any,s:any)=>deletion.isDeleted(tx,s)});
 const before=await f.publishingSnapshot(),read=adapter.list(asset,'messages',null,25);await waiting;
 try{await deletion.markItem({workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1},'messages','deleted-in-flight');}finally{release();}
 assert.equal((await read).items.length,0);assert.equal(await f.db.instagramInteractionMessage.count({where:{connectionId:f.instagramConnectionIds[0],providerId:'deleted-in-flight'}}),0);assert.deepEqual(await f.publishingSnapshot(),before);
}));
