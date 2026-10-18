import {createHmac,randomBytes} from 'node:crypto';
import type {PrismaClient,Prisma} from '@prisma/client';
import {HttpError} from '../utils/errors';
import {z} from 'zod';
export type MetaDeletionAsset={workspaceId:string;platform:'facebook'|'instagram';appId:string;providerAssetId:string;connectionId:string;connectionVersion:number};
export type MetaDeletionSubject=Omit<MetaDeletionAsset,'connectionId'>&{actorId?:string;providerEventId:string;eventKind?:'comments'|'messages';occurredAt:Date};
export type MetaDeletionTarget={asset:MetaDeletionAsset;kind:'item'|'actor'|'asset';eventKind?:'comments'|'messages';subjectId?:string;phase:'pending'|'messages'|'comments'|'sources_done';rawAfter?:string};
type Deps={db:PrismaClient;hmacKey:string;encrypt:(value:string)=>string;decrypt:(value:string)=>string;now?:()=>Date};
const validId=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=256;
/** Internal transactional admission only. Not a frontend-selected deletion API. */
export function createMetaInboxDeletion({db,hmacKey,encrypt,decrypt,now=()=>new Date()}:Deps){
 if(hmacKey.length<16)throw new Error('Meta deletion configuration unavailable');
 function digest(a:Omit<MetaDeletionAsset,'connectionId'>,kind:string,parts:unknown[]){return createHmac('sha256',hmacKey).update(JSON.stringify([a.workspaceId,a.platform,a.appId,a.providerAssetId,kind,...parts])).digest('hex');}
 function namespace(a:Omit<MetaDeletionAsset,'connectionId'>){
  if(!/^[a-f0-9-]{36}$/i.test(a.workspaceId)||!['facebook','instagram'].includes(a.platform)||!/^\d{1,256}$/.test(a.appId)||!/^\d{1,256}$/.test(a.providerAssetId)||!Number.isInteger(a.connectionVersion)||a.connectionVersion<1)throw new HttpError(400,'Invalid Meta deletion scope');
  return{workspaceId:a.workspaceId,platform:a.platform,appId:a.appId};
 }
 async function connection(tx:Prisma.TransactionClient,a:MetaDeletionAsset){
  namespace(a);
  // Facebook admission requires its own verified Page selection mapping; never infer it from Instagram IDs.
  if(a.platform!=='instagram')throw new HttpError(409,'Facebook deletion mapping not integrated');
  if(!/^[a-f0-9-]{36}$/i.test(a.connectionId))throw new HttpError(400,'Invalid Meta connection');
  await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${a.connectionId}::uuid FOR UPDATE`;
  const c=await tx.instagramManagementConnection.findFirst({where:{id:a.connectionId,workspaceId:a.workspaceId,appId:a.appId,providerAccountId:a.providerAssetId,version:a.connectionVersion}});
  if(!c)throw new HttpError(404,'Meta deletion connection unavailable');return c;
 }
 async function marker(tx:Prisma.TransactionClient,a:MetaDeletionAsset,kind:'actor'|'asset'|'item',parts:unknown[],at:Date,updateCutoff=false){
  const key={...namespace(a),subjectKind:kind,subjectHash:digest(a,kind,parts)};
  await tx.metaInboxDeletionMarker.upsert({where:{workspaceId_platform_appId_subjectKind_subjectHash:key},create:{...key,createdAt:at},update:updateCutoff?{createdAt:at}:{}});
 }
 async function queue(tx:Prisma.TransactionClient,target:MetaDeletionTarget,reason:string,at:Date){
  const a=target.asset,parts=[target.eventKind??null,target.subjectId??null,a.connectionVersion],subjectHash=digest(a,target.kind,parts),requestKey=digest(a,'request',[target.kind,...parts]);
  const row=await tx.metaInboxDeletionRequest.upsert({where:{requestKey},create:{...namespace(a),subjectKind:target.kind,subjectHash,reason,requestKey,confirmationCode:randomBytes(32).toString('base64url'),createdAt:at,nextAttemptAt:at,targetEncrypted:encrypt(JSON.stringify(target))},update:{}});
  return{confirmationCode:row.confirmationCode};
 }
 return{
  async markItem(a:MetaDeletionAsset,eventKind:'comments'|'messages',eventId:string){
   if(!['comments','messages'].includes(eventKind)||!validId(eventId))throw new HttpError(400,'Invalid Meta deletion target');
   return db.$transaction(async tx=>{await connection(tx,a);const at=now();await marker(tx,a,'item',[eventKind,eventId],at);return queue(tx,{asset:a,kind:'item',eventKind,subjectId:eventId,phase:'pending'},'verified_content_deletion',at);});
  },
  async markActor(a:MetaDeletionAsset,actorId:string){
   if(!validId(actorId)||actorId===a.providerAssetId)throw new HttpError(400,'Invalid Meta actor deletion');
   return db.$transaction(async tx=>{const c=await connection(tx,a);if(actorId===c.providerUserId)throw new HttpError(400,'Meta actor is the business identity');const at=now();await marker(tx,a,'actor',[actorId],at);return queue(tx,{asset:a,kind:'actor',subjectId:actorId,phase:'pending'},'verified_actor_deletion',at);});
  },
  async disconnect(a:MetaDeletionAsset){
   return db.$transaction(async tx=>{
    await connection(tx,a);const at=now();
    await tx.instagramManagementConnection.update({where:{id:a.connectionId},data:{status:'disconnected',tokenEncrypted:null,version:{increment:1},notificationsEnabled:false}});
    await marker(tx,a,'asset',['version',a.connectionVersion],at);await marker(tx,a,'asset',['cutoff'],at,true);
    return queue(tx,{asset:a,kind:'asset',phase:'pending'},'connection_disconnected',at);
   });
  },
  async isDeleted(tx:Prisma.TransactionClient,s:MetaDeletionSubject){
   const n=namespace(s),keys:Array<{subjectKind:string;subjectHash:string}>=[{subjectKind:'asset',subjectHash:digest(s,'asset',['version',s.connectionVersion])}];
   if(s.actorId)keys.push({subjectKind:'actor',subjectHash:digest(s,'actor',[s.actorId])});
   for(const kind of s.eventKind?[s.eventKind]:['comments','messages'])keys.push({subjectKind:'item',subjectHash:digest(s,'item',[kind,s.providerEventId])});
   if(await tx.metaInboxDeletionMarker.findFirst({where:{...n,OR:keys},select:{id:true}}))return true;
   const cutoff=await tx.metaInboxDeletionMarker.findUnique({where:{workspaceId_platform_appId_subjectKind_subjectHash:{...n,subjectKind:'asset',subjectHash:digest(s,'asset',['cutoff'])}},select:{createdAt:true}});
   return !!cutoff&&(!Number.isFinite(s.occurredAt.getTime())||s.occurredAt<=cutoff.createdAt);
  },
  async purgeSources(code:string,limit:number){
   if(!Number.isInteger(limit)||limit<1||limit>50||!/^[a-zA-Z0-9_-]{32,128}$/.test(code))throw new HttpError(400,'Invalid Meta source purge');
   return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "MetaInboxDeletionRequest" WHERE "confirmationCode"=${code} FOR UPDATE`;
    const request=await tx.metaInboxDeletionRequest.findUnique({where:{confirmationCode:code}});if(!request?.targetEncrypted||request.status!=='pending')throw new HttpError(409,'Meta source purge unavailable');
    let t:MetaDeletionTarget;
    try{t=z.object({asset:z.object({workspaceId:z.string().uuid(),platform:z.enum(['facebook','instagram']),appId:z.string().regex(/^\d{1,256}$/),providerAssetId:z.string().regex(/^\d{1,256}$/),connectionId:z.string().uuid(),connectionVersion:z.number().int().positive()}),kind:z.enum(['item','actor','asset']),eventKind:z.enum(['comments','messages']).optional(),subjectId:z.string().min(1).max(256).optional(),phase:z.enum(['pending','messages','comments','sources_done']),rawAfter:z.string().uuid().optional()}).strict().parse(JSON.parse(decrypt(request.targetEncrypted)));}catch{throw new HttpError(409,'Meta purge locator unavailable');}
    const a=t.asset,parts=[t.eventKind??null,t.subjectId??null,a.connectionVersion];
    if(a.platform!=='instagram'||request.workspaceId!==a.workspaceId||request.appId!==a.appId||request.platform!==a.platform||request.subjectKind!==t.kind||request.requestKey!==digest(a,'request',[t.kind,...parts])||t.kind==='item'&&(!t.eventKind||!t.subjectId)||t.kind==='actor'&&!t.subjectId)throw new HttpError(409,'Meta purge scope unavailable');
    const where={workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:{lte:a.connectionVersion}};let purged=0;
    if(t.phase==='pending'){
     // Scan at most limit raw envelopes before removing their source mapping.
     const rows=await tx.instagramInteractionEvent.findMany({where:{...where,...(t.rawAfter?{id:{gt:t.rawAfter}}:{})},orderBy:{id:'asc'},take:limit});
     const ids:string[]=[];
     for(const row of rows){
      const payload=row.payload as any;let field=payload?.field,eventId=payload?.eventId;
      try{const key=JSON.parse(row.eventKey);field??=key[0];eventId??=key[1];}catch{/* Legacy metadata is not treated as a verified actor mapping. */}
      let matches=t.kind==='asset'||t.kind==='item'&&field===t.eventKind&&eventId===t.subjectId||t.kind==='actor'&&(payload?.senderId===t.subjectId||payload?.recipientId===t.subjectId);
      if(!matches&&t.kind==='actor'&&typeof eventId==='string'){
       const sourceWhere={workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:row.connectionVersion,providerId:eventId,actorId:t.subjectId};
       matches=!!(field==='messages'?await tx.instagramInteractionMessage.findFirst({where:sourceWhere,select:{id:true}}):field==='comments'?await tx.instagramInteractionComment.findFirst({where:sourceWhere,select:{id:true}}):null);
      }
      if(matches)ids.push(row.id);
     }
     purged=(await tx.instagramInteractionEvent.deleteMany({where:{...where,id:{in:ids}}})).count;
     if(rows.length<limit){t.phase='messages';delete t.rawAfter;}else t.rawAfter=rows.at(-1)!.id;
    }else if(t.phase==='messages'||t.phase==='comments'){
     const kind=t.phase;
     if(t.kind==='item'&&t.eventKind!==kind)t.phase=kind==='messages'?'comments':'sources_done';
     else{
      const scoped={...where,...(t.kind==='item'?{providerId:t.subjectId}:t.kind==='actor'?{actorId:t.subjectId}:{})};
      const rows=kind==='messages'?await tx.instagramInteractionMessage.findMany({where:scoped,orderBy:{id:'asc'},take:limit,select:{id:true}}):await tx.instagramInteractionComment.findMany({where:scoped,orderBy:{id:'asc'},take:limit,select:{id:true}});
      const ids=rows.map(v=>v.id);purged=kind==='messages'?(await tx.instagramInteractionMessage.deleteMany({where:{...scoped,id:{in:ids}}})).count:(await tx.instagramInteractionComment.deleteMany({where:{...scoped,id:{in:ids}}})).count;
      if(rows.length<limit)t.phase=kind==='messages'?'comments':'sources_done';
     }
    }
    await tx.metaInboxDeletionRequest.update({where:{id:request.id},data:{targetEncrypted:encrypt(JSON.stringify(t))}});
    // Derived identities, notes, cases and receipts are a separate required stage.
    // Never publish a completed receipt merely because source bodies were removed.
    return{purged,sourcesComplete:t.phase==='sources_done'};
   },{timeout:15000});
  },
  async status(code:string):Promise<'pending'|'completed'|null>{
   if(!/^[a-zA-Z0-9_-]{32,128}$/.test(code))return null;
   const row=await db.metaInboxDeletionRequest.findUnique({where:{confirmationCode:code},select:{status:true}});return row?row.status==='completed'?'completed':'pending':null;
  }
 };
}
