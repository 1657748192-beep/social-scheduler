import {randomUUID,createHash} from 'node:crypto';import type {MetaInboxFixture} from './metaInboxFixture';
import {parseInstagramReplyRecording} from '../../src/instagramManagement/replyRecording';import {createInstagramManagementAccess} from '../../src/instagramManagement/access';import {createLiveInboxPolicy} from '../../src/interactionInbox/livePolicy';
import {REC3_TEXT} from '../../src/instagramManagement/recordingGrantIdentity';
export async function seedRec3Fixture(f:MetaInboxFixture){
 const now=new Date(),accountId=f.instagramAccountIds[0],connectionId=f.instagramConnectionIds[0],workspaceId=f.adminCtx.workspaceId;
 await f.db.socialAccount.update({where:{id:accountId},data:{capabilities:{profileUsername:'mooyamcosmetic'}}});
 const common={workspaceId,connectionId,connectionVersion:1,actorId:'300',inbound:true,conversationId:'thread-rec3'};
 const rec1=await f.db.instagramInteractionMessage.create({data:{...common,providerId:'incoming-rec1',text:'SS-IG-DM-1022-REC1 demo',occurredAt:new Date(+now-180000)}});
 const rec2=await f.db.instagramInteractionMessage.create({data:{...common,providerId:'incoming-rec2',text:'SS-IG-DM-1023-REC2 demo',occurredAt:new Date(+now-90000)}});
 const rec3=await f.db.instagramInteractionMessage.create({data:{...common,providerId:'incoming-rec3',text:'SS-IG-DM-1023-REC3 review demo',occurredAt:new Date(+now-30000)}});
 const comment=await f.db.instagramInteractionComment.create({data:{workspaceId,connectionId,connectionVersion:1,providerId:'old-comment',mediaId:'media',actorId:'300',text:'SS-IG-C-1022-REC1 demo',occurredAt:new Date(+now-180000)}});
 const targetHash=createHash('sha256').update(JSON.stringify(['message','300'])).digest('hex'),legacy=[];
 for(const [i,age] of [[1,150000],[2,60000]]){
  const row=await f.db.instagramInteractionSendAttempt.create({data:{workspaceId,connectionId,connectionVersion:1,requestKey:randomUUID(),targetHash,payloadHash:createHash('sha256').update(JSON.stringify(`Social Scheduler Instagram messaging reply test REC${i}. This reply is for app review demonstration only.`)).digest('hex'),status:'sent',providerId:'legacy-reply-'+i,createdAt:new Date(+now-age-1000),updatedAt:new Date(+now-age)}});legacy.push(row);
  await f.db.interactionAudit.create({data:{workspaceId,actorId:f.adminCtx.userId,action:'instagram.reply.original',targetId:connectionId,result:'1:'+row.requestKey}});
 }
 const record=(v:typeof rec1)=>({sourceRecordId:v.id,providerEventId:v.providerId,actorId:v.actorId,conversationId:v.conversationId});
 const rawRule={enabled:true,userId:f.adminCtx.userId,workspaceId,accountId,appId:'456',providerAccountId:'100',connectionId,connectionVersion:1,username:'mooyamcosmetic',expiresAt:new Date(+now+60000).toISOString(),comment:{sourceRecordId:comment.id,providerEventId:comment.providerId,actorId:'300',mediaId:'media'},message:record(rec1),messageRec2:{...record(rec2),expiresAt:new Date(+now+60000).toISOString()},messageRec3:{...record(rec3),expiresAt:new Date(+now+60000).toISOString()}};
 const rule=parseInstagramReplyRecording(JSON.stringify(rawRule))!;
 const policy=createLiveInboxPolicy([{workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',readEnabled:true,sendEnabled:true,policy:{product:'synthetic',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:1,replyWindowMs:86400000,reviewed:true}}]);
 const access=createInstagramManagementAccess({db:f.db,appId:'456',policy,decrypt:v=>v,inspect:async()=>({appId:'456',providerAccountId:'100',scopes:['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'],expiresAt:new Date(+now+86400000)})});
 const asset=await access.resolve(f.adminCtx,accountId,'messages.reply'),source={...asset.sourceRef!,sourceRecordId:rec3.id,conversationId:rec3.conversationId,participantId:'300'};
 return{rule,rawRule,asset,source,policy,access,now,rec1,rec2,rec3,legacy,text:REC3_TEXT,input:(patch:Record<string,unknown>={})=>({asset,source,requestKey:randomUUID(),kind:'message' as const,targetId:'300',text:REC3_TEXT,...patch}),oldSnapshot:async()=>({attempts:await f.db.instagramInteractionSendAttempt.findMany({where:{id:{in:legacy.map(v=>v.id)}},orderBy:{id:'asc'}}),publishing:await f.publishingSnapshot()})};
}
export async function cleanRec3Fixture(f:MetaInboxFixture){await f.db.instagramReplyRecordingGrant.deleteMany({where:{workspaceId:{in:f.workspaceIds}}});}
