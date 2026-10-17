import {randomUUID} from 'node:crypto';import type {PrismaClient} from '@prisma/client';import type Redis from 'ioredis';import {z} from 'zod';
import {HttpError} from '../utils/errors';import type {InboxAccess} from './access';import type {InboxRegistry} from './adapters/registry';import type {createInboxProjection} from './projection';import type {Scope,AdapterPage} from './types';import {encodeInboxCursor,decodeInboxCursor} from './cursor';
import {sourceSchema} from './access';
const acquire="redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); if redis.call('EXISTS',KEYS[2])==1 then return 0 end; if redis.call('ZCARD',KEYS[1])>=4 then return -1 end; redis.call('SET',KEYS[2],'1','EX',30); redis.call('ZADD',KEYS[1],ARGV[2],ARGV[3]); redis.call('EXPIRE',KEYS[1],120); return 1";
export function createInboxReception({db,access,registry,projection,redis}:{db:PrismaClient;access:InboxAccess;registry:InboxRegistry;projection:ReturnType<typeof createInboxProjection>;redis:Pick<Redis,'eval'|'zrem'|'get'|'set'>}){
 async function refreshInbox(ctx:Scope,input:unknown){
  const q=z.object({accountIds:z.array(z.string().uuid()).min(1).max(50),kind:z.enum(['comments','messages','mentions']),cursor:z.string().max(2048).optional()}).strict().parse(input);await access.require(ctx,'write');
  const scope={ctx,accountIds:[...q.accountIds].sort(),kind:q.kind};let cursors:Record<string,string>={};
  if(q.cursor){const saved=z.object({continuation:z.string().uuid()}).strict().parse(decodeInboxCursor(scope,q.cursor)),raw=await redis.get('interaction-inbox:continuation:'+saved.continuation);if(!raw||raw.length>120000)throw new HttpError(400,'Expired interaction continuation');cursors=z.record(z.string().max(2048)).parse(JSON.parse(raw));}
  const pending=q.cursor?q.accountIds.filter(id=>Object.hasOwn(cursors,id)):q.accountIds;
  const results:Array<{accountId:string;status:string;revision?:number;diagnosticId?:string}>=[],next:Record<string,string>={},deadline=Date.now()+30000;let position=0;
  async function worker(){while(position<pending.length){const accountId=pending[position++];next[accountId]=cursors[accountId]??'';let lease:string|null=null,remote:Promise<AdapterPage>|null=null,timer:ReturnType<typeof setTimeout>|undefined,knownAssetId:string|null=null;
   try{
    if(Date.now()>=deadline)throw new HttpError(429,'Refresh budget reached');const a=await access.resolveInboxAsset(ctx,accountId,`${q.kind}.read` as any);
    knownAssetId=(await db.interactionAsset.findUnique({where:{workspaceId_canonicalKey:{workspaceId:ctx.workspaceId,canonicalKey:a.canonicalKey}},select:{id:true}}))?.id??null;
    lease=randomUUID();const acquired=Number(await redis.eval(acquire,2,'interaction-inbox:active-reads',`interaction-inbox:cooldown:${ctx.workspaceId}:${accountId}:${q.kind}`,Date.now(),Date.now()+90000,lease));if(acquired!==1)throw new HttpError(429,'Refresh rate limited');
    remote=registry.getInboxAdapter(a.platform).list(a,q.kind,cursors[accountId]||null,25);
    const page=await Promise.race([remote,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new HttpError(503,'Provider read timed out')),Math.max(1,deadline-Date.now()));})]);
    const projected=await projection.projectVerifiedPage(ctx,a,page),asset=await db.interactionAsset.findUniqueOrThrow({where:{workspaceId_canonicalKey:{workspaceId:ctx.workspaceId,canonicalKey:a.canonicalKey}}});
    await access.write(ctx,async tx=>{await tx.interactionSyncState.upsert({where:{assetId_kind:{assetId:asset.id,kind:q.kind}},create:{workspaceId:ctx.workspaceId,assetId:asset.id,kind:q.kind,status:page.nextCursor?'incomplete':'ok',lastAttemptAt:new Date(),lastSuccessAt:new Date(),revision:1,cursor:page.nextCursor},update:{status:page.nextCursor?'incomplete':'ok',lastAttemptAt:new Date(),lastSuccessAt:new Date(),revision:{increment:1},cursor:page.nextCursor}});});
    if(page.nextCursor)next[accountId]=page.nextCursor;else delete next[accountId];results.push({accountId,status:page.nextCursor?'incomplete':'ok',revision:projected.revision});
   }catch(e){const diagnosticId=randomUUID(),limited=e instanceof HttpError&&e.statusCode===429;results.push({accountId,status:limited?'rate_limited':'unavailable',diagnosticId});const assetId=knownAssetId;if(assetId&&!limited){try{await access.write(ctx,async tx=>{await tx.interactionSyncState.updateMany({where:{workspaceId:ctx.workspaceId,assetId,kind:q.kind},data:{status:'error',lastAttemptAt:new Date(),diagnosticId}});});}catch{/* Access loss must not grant a cache write. */}}}
   finally{if(timer)clearTimeout(timer);const id=lease;if(id){if(remote)void remote.catch(()=>undefined).finally(()=>redis.zrem('interaction-inbox:active-reads',id).catch(()=>undefined));else await redis.zrem('interaction-inbox:active-reads',id).catch(()=>undefined);}}
  }}
  await Promise.all(Array.from({length:Math.min(4,q.accountIds.length)},worker));await access.require(ctx,'write');
  if(results.length===1&&results[0].status==='rate_limited')throw new HttpError(429,'Refresh rate limited',{retryAfter:30});
  let nextCursor:string|null=null;if(Object.keys(next).length){const continuation=randomUUID();await redis.set('interaction-inbox:continuation:'+continuation,JSON.stringify(next),'EX',900);nextCursor=encodeInboxCursor(scope,{continuation});}
  return{results,partial:results.some(r=>r.status!=='ok'),nextCursor,observedAt:new Date().toISOString()};
 }
 async function projectFacebookSourceBatch(sourceRefs:string[],_now:Date,ctx?:Scope){
  if(!ctx||sourceRefs.length>50)return 0;await access.require(ctx,'write');
  const sources=await db.facebookInteractionMessage.findMany({where:{id:{in:sourceRefs},page:{connection:{workspaceId:ctx.workspaceId}}},take:50,include:{page:true}});let count=0;
  for(const pageId of new Set(sources.map(s=>s.managedPageId))){const page=sources.find(s=>s.managedPageId===pageId)!.page,account=await db.socialAccount.findFirst({where:{workspaceId:ctx.workspaceId,platform:'facebook',providerAccountId:page.pageId,status:'active'}});if(!account)continue;try{const a=await access.resolveInboxAsset(ctx,account.id,'messages.read');if(sourceSchema.parse(a.sourceRef).managedPageId!==pageId)continue;const items=await registry.getInboxAdapter('facebook').normalizeVerifiedEvent(sources.filter(s=>s.managedPageId===pageId).map(s=>s.id),a);count+=(await projection.projectVerifiedPage(ctx,a,{items,nextCursor:null,coverage:'verified_received_sources',warnings:[]})).count;}catch{/* Retry only under an authorized visible refresh, never under an assumed user. */}}
  return count;
 }
 return{refreshInbox,projectFacebookSourceBatch};
}
