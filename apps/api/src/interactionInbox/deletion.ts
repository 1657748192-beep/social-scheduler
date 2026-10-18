import {createHash,createHmac,randomBytes} from 'node:crypto';
import type {PrismaClient,Prisma} from '@prisma/client';
import {HttpError} from '../utils/errors';
import {z} from 'zod';
import {requireVerifiedMetaDeletionProof,type VerifiedMetaDeletionProof,type MetaDeletionNamespace} from './metaDeletionRoutes';
export type MetaDeletionAsset={workspaceId:string;platform:'facebook'|'instagram';appId:string;providerAssetId:string;connectionId:string;connectionVersion:number};
export type MetaDeletionSubject=Omit<MetaDeletionAsset,'connectionId'>&{actorId?:string;providerEventId:string;eventKind?:'comments'|'messages';occurredAt:Date};
export type MetaDeletionTarget={asset:MetaDeletionAsset;kind:'item'|'actor'|'asset';eventKind?:'comments'|'messages';subjectId?:string;phase:'pending'|'messages'|'comments'|'sources_done';rawAfter?:string;sourceIds?:string[];activeCaseId?:string;cleanupCustomerId?:string;unmappedRaw?:boolean;unmappedItem?:boolean};
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
 function decode(request:{workspaceId:string;platform:string;appId:string;subjectKind:string;requestKey:string|null;targetEncrypted:string|null}){
  let t:MetaDeletionTarget;
  try{t=z.object({asset:z.object({workspaceId:z.string().uuid(),platform:z.enum(['facebook','instagram']),appId:z.string().regex(/^\d{1,256}$/),providerAssetId:z.string().regex(/^\d{1,256}$/),connectionId:z.string().uuid(),connectionVersion:z.number().int().positive()}),kind:z.enum(['item','actor','asset']),eventKind:z.enum(['comments','messages']).optional(),subjectId:z.string().min(1).max(256).optional(),phase:z.enum(['pending','messages','comments','sources_done']),rawAfter:z.string().uuid().optional(),sourceIds:z.array(z.string().uuid()).max(50).optional(),activeCaseId:z.string().uuid().optional(),cleanupCustomerId:z.string().uuid().optional(),unmappedRaw:z.boolean().optional(),unmappedItem:z.boolean().optional()}).strict().parse(JSON.parse(decrypt(request.targetEncrypted!)));}catch{throw new HttpError(409,'Meta purge locator unavailable');}
  const a=t.asset,parts=[t.eventKind??null,t.subjectId??null,a.connectionVersion];
  if(a.platform!=='instagram'||request.workspaceId!==a.workspaceId||request.appId!==a.appId||request.platform!==a.platform||request.subjectKind!==t.kind||request.requestKey!==digest(a,'request',[t.kind,...parts])||t.kind==='item'&&(!t.eventKind||!t.subjectId)||t.kind==='actor'&&!t.subjectId)throw new HttpError(409,'Meta purge scope unavailable');return t;
 }
 return{
  async markItem(a:MetaDeletionAsset,eventKind:'comments'|'messages',eventId:string){
   if(!['comments','messages'].includes(eventKind)||!validId(eventId))throw new HttpError(400,'Invalid Meta deletion target');
   return db.$transaction(async tx=>{
    await connection(tx,a);const at=now(),where={workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:{lte:a.connectionVersion},providerId:eventId};
    const sources=eventKind==='messages'?await tx.instagramInteractionMessage.findMany({where,take:51,select:{id:true}}):await tx.instagramInteractionComment.findMany({where,take:51,select:{id:true}});if(sources.length>50)throw new HttpError(409,'Meta deletion admission exceeds bounded source mapping');
    const indexed=eventKind==='messages'&&!sources.length?await tx.interactionItem.findFirst({where:{workspaceId:a.workspaceId,platform:'instagram',providerEventId:eventId,case:{asset:{canonicalKey:JSON.stringify([a.platform,a.appId,a.providerAssetId]),instagramConnectionId:a.connectionId}},AND:[{sourceRef:{path:['connectionId'],equals:a.connectionId}},{sourceRef:{path:['connectionVersion'],lte:a.connectionVersion}}]},select:{id:true}}):null;
    await marker(tx,a,'item',[eventKind,eventId],at);return queue(tx,{asset:a,kind:'item',eventKind,subjectId:eventId,sourceIds:sources.map(v=>v.id),unmappedItem:eventKind==='messages'&&!sources.length&&!indexed,phase:'pending'},'verified_content_deletion',at);
   });
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
  async requestUserDeletion(n:MetaDeletionNamespace,proof:VerifiedMetaDeletionProof,reason:'data_deletion'|'deauthorization'){
   const verified=requireVerifiedMetaDeletionProof(proof),at=now();
   if(n.platform!=='instagram'||!/^\d{1,256}$/.test(n.appId)||!['data_deletion','deauthorization'].includes(reason))throw new HttpError(409,'Meta app deletion mapping unavailable');
   const subjectHash=createHmac('sha256',hmacKey).update(JSON.stringify(['app-user',n.platform,n.appId,verified.userId])).digest('hex');
   const requestKey=createHmac('sha256',hmacKey).update(JSON.stringify(['app-request',subjectHash,verified.issuedAt,reason])).digest('hex');
   return db.$transaction(async tx=>{
    // Serialize duplicate/multi-reason callbacks for the same app-scoped subject,
    // then lock verified independent connections in stable order. No Graph calls.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${subjectHash},0))`;
    const existing=await tx.metaInboxAppDeletionRequest.findUnique({where:{requestKey}});if(existing)return{confirmationCode:existing.confirmationCode};
    const where={platform:'instagram' as const,appId:n.appId,providerUserId:verified.userId};
    const candidates=await tx.instagramManagementConnection.findMany({where,orderBy:{id:'asc'},take:51,select:{id:true}});
    if(candidates.length>50)throw new HttpError(409,'Meta app deletion mapping exceeds bounded admission');
    const targets:Array<{id:string;workspaceId:string}>=[];let unresolved=candidates.length===0;
    for(const candidate of candidates){
     await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${candidate.id}::uuid FOR UPDATE`;
     const c=await tx.instagramManagementConnection.findFirst({where:{...where,id:candidate.id}});
     // updatedAt is not consent time; unknown legacy provenance is not authority
     // to disconnect a later grant. Same-second consent is conservatively newer.
     if(!c||!c.authorizedAt||c.authorizedAt.getTime()>=verified.issuedAt*1000){unresolved=true;continue;}
     const a:MetaDeletionAsset={workspaceId:c.workspaceId,platform:'instagram',appId:c.appId,providerAssetId:c.providerAccountId,connectionId:c.id,connectionVersion:c.version};
     await tx.instagramManagementConnection.update({where:{id:c.id},data:{status:'disconnected',tokenEncrypted:null,version:{increment:1},notificationsEnabled:false}});
     await marker(tx,a,'asset',['version',a.connectionVersion],at);await marker(tx,a,'asset',['cutoff'],at,true);
     const queued=await queue(tx,{asset:a,kind:'asset',phase:'pending'},reason,at);
     const child=await tx.metaInboxDeletionRequest.findUniqueOrThrow({where:{confirmationCode:queued.confirmationCode},select:{id:true,workspaceId:true}});targets.push(child);
    }
    const row=await tx.metaInboxAppDeletionRequest.create({data:{platform:n.platform,appId:n.appId,subjectHash,requestKey,reason,confirmationCode:randomBytes(32).toString('base64url'),targetEncrypted:encrypt(JSON.stringify({version:1,targets,unresolved})),createdAt:at}});
    return{confirmationCode:row.confirmationCode};
   },{timeout:15000});
  },
  async settleAppDeletion(code:string):Promise<boolean>{
   if(!/^[a-zA-Z0-9_-]{32,128}$/.test(code))throw new HttpError(400,'Invalid Meta deletion receipt');
   return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "MetaInboxAppDeletionRequest" WHERE "confirmationCode"=${code} FOR UPDATE`;
    const row=await tx.metaInboxAppDeletionRequest.findUnique({where:{confirmationCode:code}});if(!row)throw new HttpError(404,'Meta deletion unavailable');if(row.status==='completed')return true;
    let locator:{version:1;targets:Array<{id:string;workspaceId:string}>;unresolved:boolean};
    try{locator=z.object({version:z.literal(1),targets:z.array(z.object({id:z.string().uuid(),workspaceId:z.string().uuid()}).strict()).max(50),unresolved:z.boolean()}).strict().parse(JSON.parse(decrypt(row.targetEncrypted!)));}catch{throw new HttpError(409,'Meta app deletion locator unavailable');}
    if(locator.unresolved||!locator.targets.length||new Set(locator.targets.map(v=>v.id)).size!==locator.targets.length)return false;
    const children=await tx.metaInboxDeletionRequest.findMany({where:{id:{in:locator.targets.map(v=>v.id)}},take:50,select:{id:true,workspaceId:true,appId:true,platform:true,subjectKind:true,status:true}});
    if(children.length!==locator.targets.length||locator.targets.some(target=>!children.some(child=>child.id===target.id&&child.workspaceId===target.workspaceId&&child.appId===row.appId&&child.platform===row.platform&&child.subjectKind==='asset'&&child.status==='completed')))return false;
    await tx.metaInboxAppDeletionRequest.update({where:{id:row.id},data:{status:'completed',completedAt:now(),targetEncrypted:null}});return true;
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
    const t=decode(request),a=t.asset;
    const where={workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:{lte:a.connectionVersion}};let purged=0;
    if(t.phase==='pending'){
     // Scan at most limit raw envelopes before removing their source mapping.
     const rows=await tx.instagramInteractionEvent.findMany({where:{...where,...(t.rawAfter?{id:{gt:t.rawAfter}}:{})},orderBy:{id:'asc'},take:limit});
     const ids:string[]=[];
     for(const row of rows){
      const payload=row.payload as any;let field=payload?.field,eventId=payload?.eventId;
      try{const key=JSON.parse(row.eventKey);field??=key[0];eventId??=key[1];}catch{/* Legacy metadata is not treated as a verified actor mapping. */}
      let matches=t.kind==='asset'||t.kind==='item'&&field===t.eventKind&&eventId===t.subjectId||t.kind==='actor'&&(payload?.senderId===t.subjectId||payload?.recipientId===t.subjectId);
      if(!matches&&t.kind==='actor'){
       const sourceWhere={workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:row.connectionVersion,providerId:typeof eventId==='string'?eventId:'__unmapped__'};
       const source=field==='messages'?await tx.instagramInteractionMessage.findFirst({where:sourceWhere,select:{actorId:true}}):field==='comments'?await tx.instagramInteractionComment.findFirst({where:sourceWhere,select:{actorId:true}}):null;
       matches=source?.actorId===t.subjectId;
       const actorKnown=validId(source?.actorId)||(field==='comments'?validId(payload?.senderId):field==='messages'&&validId(payload?.senderId)&&validId(payload?.recipientId));
       if(!actorKnown)t.unmappedRaw=true;
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
      const rows=kind==='messages'?await tx.instagramInteractionMessage.findMany({where:scoped,orderBy:{id:'asc'},take:limit,select:{id:true,providerId:true}}):await tx.instagramInteractionComment.findMany({where:scoped,orderBy:{id:'asc'},take:limit,select:{id:true,providerId:true}});
      // Forget customer/response digests, not the fact a request key was consumed.
      // Comment source IDs must remain available until their attempt metadata is scrubbed.
      const targetHash=(type:string,id:string)=>createHash('sha256').update(JSON.stringify([type,id])).digest('hex');
      const hashes=kind==='messages'&&t.kind==='actor'?[targetHash('message',t.subjectId!)]:kind==='comments'?(t.kind==='item'?[targetHash('comment',t.subjectId!)]:rows.map(v=>targetHash('comment',v.providerId))):[];
      const attempts=await tx.instagramInteractionSendAttempt.findMany({where:{...where,targetHash:t.kind==='asset'?{not:'deleted'}:{in:hashes}},take:limit,select:{id:true}});
      if(attempts.length){purged=(await tx.instagramInteractionSendAttempt.updateMany({where:{...where,id:{in:attempts.map(v=>v.id)}},data:{targetHash:'deleted',payloadHash:'deleted',providerId:null,status:'unknown'}})).count;await tx.metaInboxDeletionRequest.update({where:{id:request.id},data:{targetEncrypted:encrypt(JSON.stringify(t))}});return{purged,sourcesComplete:false};}
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
  async purgeDerived(code:string,limit:number):Promise<{purged:number;complete:boolean;blocked:string|null}>{
   if(!Number.isInteger(limit)||limit<1||limit>50||!/^[a-zA-Z0-9_-]{32,128}$/.test(code))throw new HttpError(400,'Invalid Meta derived purge');
   const peek=await db.metaInboxDeletionRequest.findUnique({where:{confirmationCode:code}});if(!peek)throw new HttpError(404,'Meta deletion unavailable');if(peek.status==='completed')return{purged:0,complete:true,blocked:null};const initial=decode(peek);
   return db.$transaction(async tx=>{
    // Same connection -> request lock order as admission; no provider calls here.
    await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${initial.asset.connectionId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "MetaInboxDeletionRequest" WHERE "confirmationCode"=${code} FOR UPDATE`;
    const request=await tx.metaInboxDeletionRequest.findUniqueOrThrow({where:{confirmationCode:code}});if(request.status==='completed')return{purged:0,complete:true,blocked:null};if(request.status!=='pending')throw new HttpError(409,'Meta deletion changed');const t=decode(request),a=t.asset;
    if(t.phase!=='sources_done')throw new HttpError(409,'Meta source purge not complete');
    const assetScope={workspaceId:a.workspaceId,canonicalKey:JSON.stringify([a.platform,a.appId,a.providerAssetId]),platform:a.platform,appNamespace:a.appId,providerAssetId:a.providerAssetId,instagramConnectionId:a.connectionId};
    let ia=await tx.interactionAsset.findFirst({where:assetScope});
    if(!ia)return{purged:0,complete:false,blocked:'asset_scope_unavailable'};
    await tx.$queryRaw`SELECT id FROM "InteractionAsset" WHERE id=${ia.id}::uuid FOR UPDATE`;
    ia=await tx.interactionAsset.findFirst({where:{...assetScope,id:ia.id}});
    if(!ia)return{purged:0,complete:false,blocked:'asset_scope_unavailable'};
    const result=async(purged=0,blocked:string|null=null)=>{await tx.metaInboxDeletionRequest.update({where:{id:request.id},data:{targetEncrypted:encrypt(JSON.stringify(t))}});return{purged,complete:false,blocked};};
    const oldSource:Prisma.InteractionItemWhereInput={workspaceId:a.workspaceId,assetId:ia.id,platform:'instagram',AND:[{sourceRef:{path:['platform'],equals:'instagram'}},{sourceRef:{path:['connectionId'],equals:a.connectionId}},{sourceRef:{path:['connectionVersion'],lte:a.connectionVersion}}]};
    const rootSource:Prisma.InteractionCaseWhereInput={AND:[{sourceRef:{path:['connectionId'],equals:a.connectionId}},{sourceRef:{path:['connectionVersion'],lte:a.connectionVersion}}]};
    let scope:Prisma.InteractionCaseWhereInput={};
    if(t.kind==='item')scope={kind:t.eventKind,OR:[{items:{some:{...oldSource,providerEventId:t.subjectId}}},...(t.eventKind==='comments'?[{sourceRef:{path:['commentId'],equals:t.subjectId!}}]:[]),...(t.sourceIds??[]).map(id=>({sourceRef:{path:['sourceRecordId'],equals:id}}))]};
    if(t.kind==='actor')scope={customer:{is:{identities:{some:{workspaceId:a.workspaceId,assetId:ia.id,providerActorId:t.subjectId}}}},OR:[{kind:'comments'},{sourceRef:{path:['participantId'],equals:t.subjectId!}}]};
    const eligible:Prisma.InteractionCaseWhereInput={workspaceId:a.workspaceId,assetId:ia.id,AND:[scope,{OR:[rootSource,{items:{some:oldSource}}]}]};
    const c=t.activeCaseId?await tx.interactionCase.findFirst({where:{id:t.activeCaseId,workspaceId:a.workspaceId,assetId:ia.id,...(t.kind==='item'?{kind:t.eventKind}:{}),AND:[{OR:[rootSource,{items:{some:oldSource}}]}]}}):await tx.interactionCase.findFirst({where:eligible,orderBy:{id:'asc'}});
    if(t.activeCaseId&&!c)return result(0,'case_scope_changed');
    if(!c&&(t.unmappedItem??(t.kind==='item'&&t.eventKind==='messages'&&!t.sourceIds?.length))&&await tx.interactionCase.count({where:{workspaceId:a.workspaceId,assetId:ia.id,kind:'messages',AND:[{OR:[rootSource,{items:{some:oldSource}}]}]}}))return result(0,'item_scope_unavailable');
    if(c){
     t.activeCaseId=c.id;await tx.$queryRaw`SELECT id FROM "InteractionCase" WHERE id=${c.id}::uuid FOR UPDATE`;
     // READ COMMITTED selection can precede a blocked lock: verify the locked row,
     // not the snapshot observed before another writer committed its changes.
     if(!await tx.interactionCase.findFirst({where:{id:c.id,workspaceId:a.workspaceId,assetId:ia.id,customerId:c.customerId,kind:c.kind,sourceRef:{equals:c.sourceRef as Prisma.InputJsonValue}},select:{id:true}}))return result(0,'case_scope_changed');
     if(t.kind==='actor'&&(!c.customerId||await tx.interactionIdentity.count({where:{workspaceId:a.workspaceId,customerId:c.customerId,assetId:ia.id,providerActorId:{not:t.subjectId}}})))return result(0,'ambiguous_case_scope');
     const items=await tx.interactionItem.findMany({where:{...oldSource,caseId:c.id,...(t.kind==='item'?{providerEventId:t.subjectId}:{})},take:limit,select:{id:true}});
     if(items.length)return result((await tx.interactionItem.deleteMany({where:{workspaceId:a.workspaceId,assetId:ia.id,caseId:c.id,id:{in:items.map(v=>v.id)}}})).count);
     const receipts=await tx.readReceipt.findMany({where:{workspaceId:a.workspaceId,caseId:c.id},take:limit,select:{id:true}});if(receipts.length)return result((await tx.readReceipt.deleteMany({where:{workspaceId:a.workspaceId,caseId:c.id,id:{in:receipts.map(v=>v.id)}}})).count);
     const remaining=await tx.interactionItem.findFirst({where:{workspaceId:a.workspaceId,assetId:ia.id,caseId:c.id,deleted:false},orderBy:[{occurredAt:'desc'},{id:'desc'}]});
     if(!remaining||t.kind!=='item'){
      const tags=await tx.interactionCaseTag.findMany({where:{workspaceId:a.workspaceId,caseId:c.id,...(remaining?{createdAt:{lte:request.createdAt}}:{})},take:limit,select:{id:true}});if(tags.length)return result((await tx.interactionCaseTag.deleteMany({where:{workspaceId:a.workspaceId,caseId:c.id,id:{in:tags.map(v=>v.id)}}})).count);
     }
     delete t.activeCaseId;
     if(remaining){const inbound=await tx.interactionItem.findFirst({where:{workspaceId:a.workspaceId,assetId:ia.id,caseId:c.id,direction:'inbound',deleted:false},orderBy:[{occurredAt:'desc'},{id:'desc'}]});await tx.interactionCase.update({where:{id:c.id},data:{sourceRef:remaining.sourceRef as Prisma.InputJsonValue,lastInboundAt:inbound?.occurredAt??null,lastInboundKey:inbound?.providerEventId??null,version:{increment:1}}});return result();}
     const removed=await tx.interactionCase.deleteMany({where:{workspaceId:a.workspaceId,assetId:ia.id,id:c.id,items:{none:{}},receipts:{none:{}},tags:{none:{}}}});if(!removed.count)return result(0,'case_scope_changed');return result(removed.count);
    }
    delete t.activeCaseId;
    if(t.cleanupCustomerId){
     const id=t.cleanupCustomerId;delete t.cleanupCustomerId;
     const removed=await tx.interactionCustomer.deleteMany({where:{id,workspaceId:a.workspaceId,identities:{none:{}},cases:{none:{}},notes:{none:{}},tags:{none:{}}}});return result(removed.count);
    }
    if(t.kind!=='item'){
     const identity=await tx.interactionIdentity.findFirst({where:{workspaceId:a.workspaceId,assetId:ia.id,platform:a.platform,appNamespace:a.appId,createdAt:{lte:request.createdAt},...(t.kind==='actor'?{providerActorId:t.subjectId}:{})},orderBy:{id:'asc'}});
     if(identity){
      await tx.$queryRaw`SELECT id FROM "InteractionCustomer" WHERE id=${identity.customerId}::uuid FOR UPDATE`;
      if(await tx.interactionIdentity.count({where:{workspaceId:a.workspaceId,customerId:identity.customerId,assetId:{not:ia.id}}})||await tx.interactionCase.count({where:{workspaceId:a.workspaceId,customerId:identity.customerId,assetId:{not:ia.id}}}))return result(0,'shared_customer_scope');
      if(await tx.interactionCase.count({where:{workspaceId:a.workspaceId,customerId:identity.customerId}})||await tx.customerNote.count({where:{workspaceId:a.workspaceId,customerId:identity.customerId,createdAt:{gt:request.createdAt}}})||await tx.interactionCustomerTag.count({where:{workspaceId:a.workspaceId,customerId:identity.customerId,createdAt:{gt:request.createdAt}}}))return result(0,'newer_scope_present');
      const notes=await tx.customerNote.findMany({where:{workspaceId:a.workspaceId,customerId:identity.customerId},take:limit,select:{id:true}});if(notes.length)return result((await tx.customerNote.deleteMany({where:{workspaceId:a.workspaceId,customerId:identity.customerId,id:{in:notes.map(v=>v.id)}}})).count);
      const tags=await tx.interactionCustomerTag.findMany({where:{workspaceId:a.workspaceId,customerId:identity.customerId},take:limit,select:{id:true}});if(tags.length)return result((await tx.interactionCustomerTag.deleteMany({where:{workspaceId:a.workspaceId,customerId:identity.customerId,id:{in:tags.map(v=>v.id)}}})).count);
      const removed=await tx.interactionIdentity.deleteMany({where:{id:identity.id,workspaceId:a.workspaceId,assetId:ia.id}});t.cleanupCustomerId=identity.customerId;return result(removed.count);
     }
    }
    if(ia.connectionVersion<=a.connectionVersion){const syncs=await tx.interactionSyncState.findMany({where:{workspaceId:a.workspaceId,assetId:ia.id},take:limit,select:{id:true}});if(syncs.length)return result((await tx.interactionSyncState.deleteMany({where:{workspaceId:a.workspaceId,assetId:ia.id,id:{in:syncs.map(v=>v.id)}}})).count);}
    const sendScope={workspaceId:a.workspaceId,assetId:ia.id,createdAt:{lte:request.createdAt},targetHash:{not:'deleted'}};
    const genericSends=await tx.interactionSendAttempt.findMany({where:sendScope,take:limit,select:{id:true}});
    if(genericSends.length){if(t.kind!=='asset')return result(0,'unmapped_send_scope');return result((await tx.interactionSendAttempt.updateMany({where:{...sendScope,id:{in:genericSends.map(v=>v.id)}},data:{targetHash:'deleted',payloadHash:'deleted',providerId:null,status:'unknown'}})).count);}
    if(t.unmappedRaw)return result(0,'raw_scope_unavailable');
    if(t.kind==='asset')await tx.interactionAsset.updateMany({where:{workspaceId:a.workspaceId,id:ia.id,connectionVersion:{lte:a.connectionVersion}},data:{active:false}});
    await tx.metaInboxDeletionRequest.update({where:{id:request.id},data:{status:'completed',completedAt:now(),targetEncrypted:null,claimToken:null,leaseExpiresAt:null}});
    return{purged:0,complete:true,blocked:null};
   },{timeout:15000});
  },
  async status(code:string):Promise<'pending'|'completed'|null>{
   if(!/^[a-zA-Z0-9_-]{32,128}$/.test(code))return null;
   const row=await db.metaInboxDeletionRequest.findUnique({where:{confirmationCode:code},select:{status:true}})??await db.metaInboxAppDeletionRequest.findUnique({where:{confirmationCode:code},select:{status:true}});return row?row.status==='completed'?'completed':'pending':null;
  }
 };
}
