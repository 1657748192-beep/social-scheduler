import type {PrismaClient} from '@prisma/client';
import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {HttpError} from '../utils/errors';
import {lockFacebookPage} from '../services/facebookSubscription';
import {requirePageSyncAccess} from './access';
import type {createFacebookPageSyncStore} from './store';
import type {createFacebookPageSyncGraph} from './graph';
import type {StoredSync,SyncContext,SyncResult,SyncView} from './types';
const selection=z.array(z.string().regex(/^\d{1,256}$/)).min(1).max(50);
export function createFacebookPageSyncService(deps:{db:PrismaClient;store:ReturnType<typeof createFacebookPageSyncStore>;graph:ReturnType<typeof createFacebookPageSyncGraph>;encrypt:(value:string)=>string}){
 const {db,store,graph,encrypt}=deps;
 async function pending(ctx:SyncContext,id:string){await requirePageSyncAccess(db,ctx);const record=await store.read(ctx,id);if(!record||record.expiresAt<=Date.now())throw new HttpError(410,'Page sync expired; authorize again');return record;}
 const hash=(ids:string[])=>createHash('sha256').update(JSON.stringify(ids)).digest('hex');
 async function accounts(ctx:SyncContext,ids:string[]){return db.socialAccount.findMany({where:{workspaceId:ctx.workspaceId,platform:'facebook',providerAccountId:{in:ids}},select:{id:true,providerAccountId:true,capabilities:true}});}
 function replay(record:StoredSync,digest:string){if(record.selectionHash!==digest)throw new HttpError(409,'This sync already accepted a different selection');if(!record.result)throw new HttpError(503,'Page sync result is not ready');return record.result;}
 return{
  async start(ctx:SyncContext){await requirePageSyncAccess(db,ctx);const state='fbps_'+randomBytes(32).toString('base64url'),authorizationUrl=graph.authorizationUrl(state);await store.createState(ctx,state);return{authorizationUrl};},
  async callback(input:{state:string;code?:string;error?:string}){
   const ctx=await store.consumeState(input.state);if(!ctx)throw new HttpError(400,'Page sync authorization expired');await requirePageSyncAccess(db,ctx);
   if(input.error||!input.code)throw new HttpError(400,'Page sync authorization cancelled');
   const result=await graph.discover(input.code);await requirePageSyncAccess(db,ctx);
   const syncId=randomBytes(32).toString('base64url');await store.saveCandidates(ctx,syncId,{pages:result.pages,rejected:result.rejected});return{syncId,workspaceId:ctx.workspaceId};
  },
  async view(ctx:SyncContext,id:string):Promise<SyncView>{
   const record=await pending(ctx,id),existing=new Set((await accounts(ctx,[...record.pages,...record.rejected].map(p=>p.pageId))).map(a=>a.providerAccountId));
   return{syncId:id,workspaceId:ctx.workspaceId,expiresAt:new Date(record.expiresAt).toISOString(),status:record.status,result:record.result,selectedPageIds:record.selectedPageIds,pages:[...record.pages.map(p=>({pageId:p.pageId,name:p.name,avatarUrl:p.avatarUrl,profileUrl:p.profileUrl,existing:existing.has(p.pageId),eligible:!p.expiresAt||p.expiresAt.getTime()>Date.now()})),...record.rejected.map(p=>({...p,existing:existing.has(p.pageId)}))]};
  },
  async confirm(ctx:SyncContext,id:string,input:string[]):Promise<SyncResult>{
   const ids=[...new Set(selection.parse(input))].sort(),digest=hash(ids),record=await pending(ctx,id);
   if(record.status==='completed')return replay(record,digest);
   if(record.selectionHash&&record.selectionHash!==digest)throw new HttpError(409,'This sync already accepted a different selection');
   const candidates=new Set([...record.pages,...record.rejected].map(p=>p.pageId));if(ids.some(pageId=>!candidates.has(pageId)))throw new HttpError(400,'Selection contains an unauthorized Page');
   const existing=new Set((await accounts(ctx,ids)).map(a=>a.providerAccountId));
   const toValidate=ids.filter(pageId=>!existing.has(pageId)).map(pageId=>{const p=record.pages.find(p=>p.pageId===pageId);if(!p||p.expiresAt&&p.expiresAt.getTime()<=Date.now())throw new HttpError(400,'Selected Page authorization is unavailable');return p;});
   const claim=await store.claim(ctx,id,'confirm',digest,ids);if(claim.leaseId==='completed')return replay(await pending(ctx,id),digest);
   const verified=await graph.revalidate(toValidate);
   const result=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM user_sessions WHERE id=${ctx.sessionId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM workspace_members WHERE user_id=${ctx.userId}::uuid AND workspace_id=${ctx.workspaceId}::uuid FOR UPDATE`;
    await requirePageSyncAccess(tx,ctx);
    if(record.expiresAt<=Date.now())throw new HttpError(410,'Page sync expired');
    const result:SyncResult={createdPageIds:[],skippedPageIds:[]};
    for(const pageId of ids){
     await lockFacebookPage(tx,pageId);
     await requirePageSyncAccess(tx,ctx);
     if(record.expiresAt<=Date.now())throw new HttpError(410,'Page sync expired');
     const old=await tx.socialAccount.findUnique({where:{workspaceId_platform_providerAccountId:{workspaceId:ctx.workspaceId,platform:'facebook',providerAccountId:pageId}},select:{capabilities:true}});
     if(old){const caps=old.capabilities as Record<string,unknown>;if(caps.pageSyncImportId===id)result.createdPageIds.push(pageId);else result.skippedPageIds.push(pageId);continue;}
     const p=verified.find(p=>p.pageId===pageId);if(!p||p.expiresAt&&p.expiresAt.getTime()<=Date.now()||!['pages_manage_posts','pages_read_engagement'].every(s=>p.scopes.includes(s)))throw new HttpError(400,'Selected Page authorization is unavailable');
     await tx.socialAccount.create({data:{workspaceId:ctx.workspaceId,platform:'facebook',providerAccountId:p.pageId,displayName:p.name,avatarUrl:p.avatarUrl,accountType:'page',status:'active',capabilities:{oauth2:true,pagePublishing:true,scopes:p.scopes,profileUrl:p.profileUrl,pageSyncImportId:id},credential:{create:{accessTokenEncrypted:encrypt(p.pageToken),tokenType:'Bearer',scopes:p.scopes,expiresAt:p.expiresAt}}}});
     result.createdPageIds.push(pageId);
    }
    await requirePageSyncAccess(tx,ctx);
    if(record.expiresAt<=Date.now())throw new HttpError(410,'Page sync expired');
    return result;
   },{timeout:30000,maxWait:10000});
   try{await store.finish(ctx,id,claim.leaseId,result);}catch{throw new HttpError(503,'Page import result needs reconciliation. Retry the same selection safely.',{code:'sync_reconcile'});}
   return result;
  },
  async cancel(ctx:SyncContext,id:string){await pending(ctx,id);const claim=await store.claim(ctx,id,'cancel');await store.cancel(ctx,id,claim.leaseId);}
 };
}
