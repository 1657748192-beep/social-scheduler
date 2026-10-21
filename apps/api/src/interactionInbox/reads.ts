import {Prisma,type PrismaClient} from '@prisma/client';import type Redis from 'ioredis';import {z} from 'zod';
import {HttpError} from '../utils/errors';import type {InboxAccess} from './access';import type {InboxRegistry} from './adapters/registry';import {parseQuery} from './limits';import {encodeInboxCursor,decodeInboxCursor} from './cursor';import {presentInboxCase} from './cases';
import type {Scope,PageResult,CaseDto,AccountStatus,ResolvedAsset,Query,DetailDto} from './types';
import {pendingInboxSend} from './sends';
import {liveInboxCaseSql} from './sourceLifetime';
import {parseInboxSource} from './source';
import {createLiveInboxPolicy,type LiveInboxPolicy} from './livePolicy';
import {sourceDeletionBoundarySql} from './sourceDeletionBoundary';
const rateScript="local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n";
export function createInboxReads({db,access,registry,redis,policy=createLiveInboxPolicy([])}:{db:PrismaClient;access:InboxAccess;registry:InboxRegistry;redis:Pick<Redis,'eval'>;policy?:LiveInboxPolicy}){
 async function listCases(ctx:Scope,input:unknown):Promise<PageResult<CaseDto>>{
  const q=parseQuery(input);await access.require(ctx);
  if(q.q){let n:number;try{n=Number(await redis.eval(rateScript,1,`interaction-inbox:search:${ctx.userId}:${ctx.workspaceId}`));}catch{throw new HttpError(503,'Search temporarily unavailable');}if(n>30)throw new HttpError(429,'Search rate limited');}
  const scope={ctx,...q,accountIds:[...q.accountIds].sort(),tagIds:[...(q.tagIds??[])].sort(),cursor:undefined},cursor=q.cursor?decodeInboxCursor(scope,q.cursor):null;
  const after=cursor?z.object({time:z.string().datetime(),id:z.string().uuid()}).strict().parse(cursor):null;
  const statuses:AccountStatus[]=[],allowed:Array<{a:ResolvedAsset;id:string}>=[];let lastSuccess:string|null=null;
  for(const accountId of q.accountIds){
   try{const a=await access.resolveInboxAsset(ctx,accountId,`${q.kind}.read` as any),stored=await db.interactionAsset.findUnique({where:{workspaceId_canonicalKey:{workspaceId:ctx.workspaceId,canonicalKey:a.canonicalKey}}});
    if(!stored||stored.connectionVersion!==a.connectionVersion||(a.platform==='facebook'?stored.facebookManagedPageId!==parseInboxSource(a.sourceRef,'facebook').managedPageId:a.platform==='instagram'?stored.instagramConnectionId!==parseInboxSource(a.sourceRef,'instagram').connectionId:true)){statuses.push({accountId,status:'not_synced',count:null});continue;}
    const sync=await db.interactionSyncState.findUnique({where:{assetId_kind:{assetId:stored.id,kind:q.kind}}});
    statuses.push({accountId,status:sync?.status==='ok'?'ok':sync?.status??'not_synced',count:null});allowed.push({a,id:stored.id});if(sync?.lastSuccessAt&&(!lastSuccess||sync.lastSuccessAt.toISOString()>lastSuccess))lastSuccess=sync.lastSuccessAt.toISOString();
   }catch{statuses.push({accountId,status:'unavailable',count:null});}
  }
  await access.require(ctx);if(!allowed.length)return{items:[],nextCursor:null,accountsStatus:statuses,partial:statuses.some(s=>s.status!=='ok'),observedAt:new Date().toISOString(),lastSuccessfulSyncAt:lastSuccess};
  const queryTime=new Date();
  const assetClause=Prisma.join(await Promise.all(allowed.map(async({a,id})=>{if(a.platform!=='facebook'&&a.platform!=='instagram')throw new HttpError(409,'Interaction platform unavailable');const days=policy.retentionForAsset({workspaceId:ctx.workspaceId,platform:a.platform,appId:a.appNamespace,providerAssetId:a.providerAssetId}).contentRetentionDays;const deletion=await sourceDeletionBoundarySql(db,a);return Prisma.sql`(c."assetId"=${id}::uuid AND ${a.platform==='facebook'?Prisma.sql`c."sourceRef"->>'managedPageId'=${parseInboxSource(a.sourceRef,'facebook').managedPageId}`:Prisma.sql`c."sourceRef"->>'instagramAccountId'=${a.accountId}`} AND c."sourceRef"->>'connectionId'=${a.sourceRef!.connectionId} AND c."sourceRef"->>'connectionVersion'=${String(a.connectionVersion)} AND ${liveInboxCaseSql(queryTime,days)} AND ${deletion})`;})),' OR ');
  const clauses=[Prisma.sql`c."workspaceId"=${ctx.workspaceId}::uuid`,Prisma.sql`(${assetClause})`,Prisma.sql`c.kind=${q.kind}`,liveInboxCaseSql()];
  if(q.status)clauses.push(Prisma.sql`c.status=${q.status}`);
  if(q.from)clauses.push(Prisma.sql`COALESCE(c."lastInboundAt",c."createdAt")>=${new Date(q.from)}`);
  if(q.to)clauses.push(Prisma.sql`COALESCE(c."lastInboundAt",c."createdAt")<=${new Date(q.to)}`);
  const read=Prisma.sql`EXISTS(SELECT 1 FROM "ReadReceipt" r WHERE r."caseId"=c.id AND r."userId"=${ctx.userId}::uuid AND r."lastReadAt">=c."lastInboundAt" AND r."lastReadKey"=c."lastInboundKey")`;
  if(q.unread===true)clauses.push(Prisma.sql`c."lastInboundAt" IS NOT NULL AND NOT(${read})`);else if(q.unread===false)clauses.push(Prisma.sql`(c."lastInboundAt" IS NULL OR ${read})`);
  for(const tagId of q.tagIds??[])clauses.push(Prisma.sql`(EXISTS(SELECT 1 FROM "InteractionCaseTag" t JOIN "InteractionTag" x ON x.id=t."tagId" WHERE t."caseId"=c.id AND t."tagId"=${tagId}::uuid AND x."deletedAt" IS NULL) OR EXISTS(SELECT 1 FROM "InteractionCustomerTag" t JOIN "InteractionTag" x ON x.id=t."tagId" WHERE t."customerId"=c."customerId" AND t."tagId"=${tagId}::uuid AND x."deletedAt" IS NULL))`);
  if(q.q){const term=q.q.toLowerCase();const search=[Prisma.sql`EXISTS(SELECT 1 FROM "InteractionIdentity" i WHERE i."customerId"=c."customerId" AND i."assetId"=c."assetId" AND (position(${term} in lower(coalesce(i."displayName",'')))>0 OR position(${term} in lower(coalesce(i.username,'')))>0))`,Prisma.sql`EXISTS(SELECT 1 FROM "CustomerNote" n WHERE n."customerId"=c."customerId" AND n."deletedAt" IS NULL AND position(${term} in lower(n.text))>0)`,Prisma.sql`EXISTS(SELECT 1 FROM "InteractionCustomerTag" t JOIN "InteractionTag" x ON x.id=t."tagId" WHERE t."customerId"=c."customerId" AND x."deletedAt" IS NULL AND position(${term} in lower(x.name))>0)`];
   if(q.searchMessages){
    const lifetime=Prisma.join(allowed.map(({a,id})=>{if(a.platform!=='facebook'&&a.platform!=='instagram')throw new HttpError(409,'Interaction platform unavailable');const cutoff=new Date(queryTime.getTime()-policy.retentionForAsset({workspaceId:ctx.workspaceId,platform:a.platform,appId:a.appNamespace,providerAssetId:a.providerAssetId}).contentRetentionDays*86400000);return Prisma.sql`(c."assetId"=${id}::uuid AND m."occurredAt">=${cutoff} AND m."receivedAt">=${cutoff})`;}),' OR ');
    const textMatch=Prisma.sql`position(${term} in lower(coalesce(m.text,'')))>0 AND m."connectionVersion"::text=i."sourceRef"->>'connectionVersion' AND (${lifetime})`;
    search.push(Prisma.sql`EXISTS(SELECT 1 FROM "InteractionItem" i WHERE i."caseId"=c.id AND NOT i.deleted AND (
     (i.platform='facebook' AND ((c.kind='messages' AND EXISTS(SELECT 1 FROM facebook_interaction_messages m WHERE m."managedPageId"::text=i."sourceRef"->>'managedPageId' AND m."providerId"=i."providerEventId" AND ${textMatch})) OR (c.kind='comments' AND EXISTS(SELECT 1 FROM facebook_interaction_comments m WHERE m."managedPageId"::text=i."sourceRef"->>'managedPageId' AND m."providerId"=i."providerEventId" AND NOT m.deleted AND ${textMatch})))) OR
     (i.platform='instagram' AND ((c.kind='messages' AND EXISTS(SELECT 1 FROM "InstagramInteractionMessage" m WHERE m."workspaceId"=c."workspaceId" AND m."connectionId"::text=i."sourceRef"->>'connectionId' AND m.id::text=i."sourceRef"->>'sourceRecordId' AND m."providerId"=i."providerEventId" AND NOT m.deleted AND ${textMatch})) OR (c.kind='comments' AND EXISTS(SELECT 1 FROM "InstagramInteractionComment" m WHERE m."workspaceId"=c."workspaceId" AND m."connectionId"::text=i."sourceRef"->>'connectionId' AND m.id::text=i."sourceRef"->>'sourceRecordId' AND m."providerId"=i."providerEventId" AND NOT m.deleted AND ${textMatch}))))))`);
   }
   clauses.push(Prisma.sql`(${Prisma.join(search,' OR ')})`);
  }
  const baseWhere=Prisma.join(clauses,' AND '),counts=await db.$queryRaw<Array<{assetId:string;count:bigint}>>(Prisma.sql`SELECT c."assetId",count(*) AS count FROM "InteractionCase" c WHERE ${baseWhere} GROUP BY c."assetId"`);
  if(after)clauses.push(Prisma.sql`(COALESCE(c."lastInboundAt",c."createdAt"),c.id)<(${new Date(after.time)},${after.id}::uuid)`);
  const rows=await db.$queryRaw<Array<{id:string;assetId:string;time:Date}>>(Prisma.sql`SELECT c.id,c."assetId",COALESCE(c."lastInboundAt",c."createdAt") AS time FROM "InteractionCase" c WHERE ${Prisma.join(clauses,' AND ')} ORDER BY COALESCE(c."lastInboundAt",c."createdAt") DESC,c.id DESC LIMIT ${q.limit+1}`);
  const items:CaseDto[]=[];
  for(const row of rows.slice(0,q.limit)){const a=allowed.find(v=>v.id===row.assetId)!.a;await access.resolveCase(ctx,row.id);items.push(await presentInboxCase(db,ctx,row.id,a.accountId));}
  for(const s of statuses)if(s.status==='ok'){const asset=allowed.find(a=>a.a.accountId===s.accountId);s.count=Number(counts.find(c=>c.assetId===asset?.id)?.count??0n);}
  await access.require(ctx);const last=rows[q.limit-1];return{items,nextCursor:rows.length>q.limit&&last?encodeInboxCursor(scope,{time:last.time.toISOString(),id:last.id}):null,accountsStatus:statuses,partial:statuses.some(s=>s.status!=='ok'),observedAt:new Date().toISOString(),lastSuccessfulSyncAt:lastSuccess};
 }
 async function getCase(ctx:Scope,id:string,input:unknown):Promise<DetailDto>{const q=parseQuery(input),{row,asset,source}=await access.resolveCase(ctx,id);if(!q.accountIds.includes(asset.accountId)||q.kind!==row.kind)throw new HttpError(404,'Interaction unavailable');
  const cursorScope={ctx,id,connectionVersion:asset.connectionVersion,source};const position=q.cursor?z.object({after:z.string().max(2048)}).strict().parse(decodeInboxCursor(cursorScope,q.cursor)).after:undefined;
  const detail=await registry.getInboxAdapter(asset.platform).detail(asset,source,position);await access.resolveCase(ctx,id);return{...await presentInboxCase(db,ctx,id,asset.accountId),...detail,nextCursor:detail.nextCursor?encodeInboxCursor(cursorScope,{after:detail.nextCursor}):null,readPosition:row.lastInboundAt&&row.lastInboundKey?{eventAt:row.lastInboundAt.toISOString(),eventKey:row.lastInboundKey}:null,pendingSend:await pendingInboxSend(db,ctx,id,source,asset,registry)};
 }
 return{listCases,getCase};
}
