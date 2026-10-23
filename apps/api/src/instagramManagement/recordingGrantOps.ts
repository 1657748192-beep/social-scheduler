import {createHmac,timingSafeEqual} from 'node:crypto';import {Prisma,type PrismaClient} from '@prisma/client';
import {isPlatformAdmin} from '../utils/platformAdmin';
import {z} from 'zod';import type {Scope,ResolvedAsset} from '../interactionInbox/types';import type {LiveInboxPolicy} from '../interactionInbox/livePolicy';import {createInboxAccess} from '../interactionInbox/access';import {createInboxProjection} from '../interactionInbox/projection';
import {createInstagramManagementGraph,instagramMessageDto} from './graph';import {createInstagramManagementAccess} from './access';import {requireInstagramAccount} from './store';import {copyInstagramReplyRecording,type InstagramReplyRecording} from './replyRecording';import {createInstagramRecordingGrants} from './recordingGrants';import type {InstagramSourceSubject} from './types';import {REC3_MARKER,REC3_MAX_AGE_MS} from './recordingGrantIdentity';import {instagramConversationIdentity} from './conversationIdentity';
type Deps={db:PrismaClient;ctx:Scope;rule:InstagramReplyRecording;policy:LiveInboxPolicy;graphVersion:string;decrypt:(v:string)=>string;evidenceKey:string;fetchImpl?:typeof fetch;now?:()=>Date;isDeleted:(tx:Prisma.TransactionClient,s:InstagramSourceSubject)=>Promise<boolean>};
const evidenceSchema=z.object({complete:z.literal(true),readAt:z.string().datetime(),binding:z.string().regex(/^[a-f0-9]{64}$/),protected:z.string().regex(/^[a-f0-9]{64}$/),message:instagramMessageDto,mac:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
function unavailable():never{throw Error('Controlled REC3 operation stopped; no send or reset was performed');}
export function createInstagramRec3Ops({db,ctx,rule:input,policy,graphVersion,decrypt,evidenceKey,fetchImpl=fetch,now=()=>new Date(),isDeleted}:Deps){
 const rule=copyInstagramReplyRecording(input)!;if(!rule.messageRec3||evidenceKey.length<24||!/^v[1-9]\d?\.0$/.test(graphVersion))unavailable();
 const rec3=rule.messageRec3!,sign=(v:unknown)=>createHmac('sha256',evidenceKey).update(JSON.stringify(v)).digest('hex');
 const source={platform:'instagram' as const,instagramAccountId:rule.accountId,connectionId:rule.connectionId,connectionVersion:rule.connectionVersion,sourceRecordId:rec3.sourceRecordId,conversationId:rec3.conversationId,participantId:rec3.actorId};
 const asset:ResolvedAsset={ctx,accountId:rule.accountId,platform:'instagram',canonicalKey:JSON.stringify(['instagram',rule.appId,rule.providerAccountId]),appNamespace:rule.appId,providerAssetId:rule.providerAccountId,sourceRef:{platform:'instagram',instagramAccountId:rule.accountId,connectionId:rule.connectionId,connectionVersion:rule.connectionVersion},connectionVersion:rule.connectionVersion};
 const grants=createInstagramRecordingGrants({db,rule,policy,now,isDeleted});
 async function connection(){
  if(ctx.workspaceId!==rule.workspaceId||ctx.userId!==rule.userId)unavailable();await requireInstagramAccount(db,ctx,rule.accountId,'manage');policy.requireAsset({workspaceId:rule.workspaceId,platform:'instagram',appId:rule.appId,providerAssetId:rule.providerAccountId},'read');
  const c=await db.instagramManagementConnection.findFirst({where:{id:rule.connectionId,workspaceId:rule.workspaceId,appId:rule.appId,providerAccountId:rule.providerAccountId,version:rule.connectionVersion,status:'active',tokenEncrypted:{not:null}}});
  if(!c||c.expiresAt&&c.expiresAt<=now()||!['instagram_business_basic','instagram_business_manage_messages'].every(v=>c.scopes.includes(v)))unavailable();
  const owner=await db.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:c.workspaceId,userId:c.userId}},include:{user:{select:{email:true}}}});if(!owner||owner.status!=='active'||!['owner','admin'].includes(owner.role)||!isPlatformAdmin(owner.user.email))unavailable();return c;
 }
 const mutable=new Set(['InteractionAsset','InteractionCase','InteractionItem','InteractionIdentity','InteractionCustomer','InstagramReplyRecordingGrant']);
 async function snapshot(protectedOnly=false){return db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;const out:Record<string,string>={};for(const m of Prisma.dmmf.datamodel.models){if(protectedOnly&&mutable.has(m.name))continue;const keys=m.fields.filter(f=>f.isId).map(f=>f.name);if(!keys.length)keys.push(...(m.primaryKey?.fields??[]));if(!keys.length)unavailable();let rows=await (tx as any)[m.name[0].toLowerCase()+m.name.slice(1)].findMany({orderBy:keys.map(k=>({[k]:'asc'}))});if(protectedOnly&&m.name==='InstagramInteractionMessage')rows=rows.filter((v:any)=>v.id!==rec3.sourceRecordId);out[m.name]=sign(rows);}return sign(out);},{isolationLevel:'RepeatableRead',timeout:60000});}
 async function binding(){const c=await connection();return sign({rule,graphVersion,token:c.tokenEncrypted,ctx});}
 return{
  async read(options:{allowProviderRead?:boolean}={}){
   if(options.allowProviderRead!==true)return{dryRun:true,requests:0} as const;
   const before=await snapshot(),protectedHash=await snapshot(true),bound=await binding(),c=await connection();let requests=0;
   const paths=new Set([`/${graphVersion}/me`,`/${graphVersion}/${rule.providerAccountId}/conversations`,`/${graphVersion}/${rec3.conversationId}`]);
   const transport:typeof fetch=async(url,opts)=>{const u=new URL(String(url));if((opts?.method??'GET')!=='GET'||u.protocol!=='https:'||u.hostname!=='graph.instagram.com'||u.port||u.username||u.password||!paths.has(u.pathname)||opts?.redirect!=='error'||++requests>10)unavailable();const response=await fetchImpl(u,{...opts,method:'GET',redirect:'error'});if(!response.ok)unavailable();return response;};
   const graph=createInstagramManagementGraph({appId:rule.appId,graphVersion,accessToken:decrypt(c.tokenEncrypted!),accountId:rule.providerAccountId,connectionVersion:c.version,fetchImpl:transport});
   if((await graph.identity()).username!=='mooyamcosmetic')unavailable();
   const threads=[];let cursor:string|undefined;do{const p=await graph.conversations(cursor);threads.push(...p.items);cursor=p.nextCursor??undefined;}while(cursor);
   const matches=threads.filter(v=>v.id===rec3.conversationId);if(matches.length!==1||!matches[0].participants.data.some(v=>v.id===rec3.actorId)||!matches[0].participants.data.some(v=>[c.providerAccountId,c.providerUserId].includes(v.id)))unavailable();
   const messages=[];cursor=undefined;do{const p=await graph.messages(rec3.conversationId,cursor);messages.push(...p.items);cursor=p.nextCursor??undefined;}while(cursor);
   const candidates=messages.filter(v=>new RegExp('^'+REC3_MARKER+'(?:\\s|$)').test(v.message??''));if(candidates.length!==1)unavailable();const message=candidates[0],at=Date.parse(message.created_time);
   if(message.id!==rec3.providerEventId||message.from.id!==rec3.actorId||message.to.data.length!==1||![c.providerAccountId,c.providerUserId].includes(message.to.data[0].id)||!Number.isFinite(at)||at>+now()||+now()-at>=REC3_MAX_AGE_MS)unavailable();
   if(messages.some(v=>[c.providerAccountId,c.providerUserId].includes(v.from.id)&&Date.parse(v.created_time)>=at))unavailable();
   if(await snapshot()!==before||await binding()!==bound)unavailable();
   const value={complete:true as const,readAt:now().toISOString(),binding:bound,protected:protectedHash,message};return{...value,mac:sign(value)};
  },
  async prepare(options:{apply?:boolean;evidence?:unknown}={}){
   if(options.apply!==true)return{dryRun:true} as const;
   const parsed=evidenceSchema.safeParse(options.evidence);if(!parsed.success)unavailable();const {mac,...evidence}=parsed.data,expected=sign(evidence);if(!timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(expected,'hex'))||+now()-Date.parse(evidence.readAt)<0||+now()-Date.parse(evidence.readAt)>60000||evidence.binding!==await binding()||evidence.protected!==await snapshot(true))unavailable();
   const c=await connection(),message=evidence.message,at=new Date(message.created_time);if(message.id!==rec3.providerEventId||message.from.id!==rec3.actorId)unavailable();
   const existing=await grants.read(asset,source);if(existing){if(existing.state==='available')await grants.prepare(asset,source);return{ready:existing.state==='available'&&+existing.expiresAt>+now(),protectedUnchanged:true,existing:true};}
   if(await db.instagramInteractionMessage.findFirst({where:{workspaceId:rule.workspaceId,connectionId:c.id,connectionVersion:c.version,actorId:rec3.actorId,conversationId:rec3.conversationId,inbound:false,deleted:false,occurredAt:{gte:at}}}))unavailable();
   const before=await snapshot(true);
   await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${c.id}::uuid FOR UPDATE`;
    if(await isDeleted(tx,{workspaceId:c.workspaceId,platform:'instagram',appId:c.appId,providerAssetId:c.providerAccountId,actorId:rec3.actorId,providerEventId:message.id,eventKind:'messages',occurredAt:at,connectionId:c.id,connectionVersion:c.version}))unavailable();
    const old=await tx.instagramInteractionMessage.findUnique({where:{connectionId_connectionVersion_providerId:{connectionId:c.id,connectionVersion:c.version,providerId:message.id}}});
    if(old&&(old.id!==rec3.sourceRecordId||old.deleted||!old.inbound||old.actorId!==rec3.actorId||old.conversationId!==rec3.conversationId||+old.occurredAt!==+at))unavailable();
    if(!old)await tx.instagramInteractionMessage.create({data:{id:rec3.sourceRecordId,workspaceId:c.workspaceId,connectionId:c.id,connectionVersion:c.version,providerId:message.id,actorId:rec3.actorId,conversationId:rec3.conversationId,inbound:true,text:message.message,occurredAt:at,receivedAt:at}});
   });
   // Only this signed read's unchanged connection/token can supply the already-verified read evidence.
   const access=createInstagramManagementAccess({db,appId:rule.appId,policy,decrypt,inspect:async()=>{if(evidence.binding!==await binding())unavailable();return{appId:c.appId,providerAccountId:c.providerAccountId,scopes:c.scopes,expiresAt:c.expiresAt??new Date(+now()+60000)};}});
   const inbox=createInboxAccess({db,policy,instagram:{enabled:true,access},facebookEnabled:false,verifyFacebook:async()=>unavailable()}),projection=createInboxProjection({db,access:inbox,policy});
   await projection.projectVerifiedPage(ctx,asset,{items:[{providerEventId:message.id,threadId:instagramConversationIdentity(c.id,c.version,rec3.actorId),actorId:rec3.actorId,actorName:message.from.username??null,actorUsername:message.from.username??null,kind:'messages',occurredAt:at.toISOString(),inbound:true,deleted:false,sourceRef:source}],nextCursor:null,coverage:'verified_account_edges',warnings:['bounded_history_only']});
   const grant=await grants.prepare(asset,source);if(before!==await snapshot(true))unavailable();return{ready:grant.state==='available',protectedUnchanged:true,existing:false};
  },
  async verify(){await connection();const grant=await grants.read(asset,source);return{ready:grant?.state==='available'&&+grant.expiresAt>+now(),unused:!!grant&&!grant.attemptId,requests:0,protected:await snapshot(true)};}
 };
}
