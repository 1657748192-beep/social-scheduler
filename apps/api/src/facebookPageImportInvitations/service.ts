import type {Prisma,PrismaClient} from '@prisma/client';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {HttpError} from '../utils/errors';
import {createMetaGrantFence} from '../interactionInbox/grantFence';
import {insertNewFacebookPages} from '../facebookPageSync/insertNewPages';
import type {createFacebookPageSyncGraph} from '../facebookPageSync/graph';
import type {createInvitationRepository} from './repository';
import {lockInvitationCreator,requireInvitationAccess} from './access';
import {invitationSummary,invitationDeadline,terminalFields,type InvitationContext,type InvitationRecord,type InvitationResult,type InvitationView,type CandidateEnvelope} from './types';
const idsSchema=z.array(z.string().regex(/^\d{1,256}$/)).min(1).max(50);
const hash=(ids:string[])=>createHash('sha256').update(JSON.stringify(ids)).digest('hex');
const unavailable=()=>new HttpError(410,'Page import no longer available');
export function createFacebookPageImportInvitationService(deps:{db:PrismaClient;appId:string;repo:ReturnType<typeof createInvitationRepository>;graph:Pick<ReturnType<typeof createFacebookPageSyncGraph>,'revalidate'>;encrypt:(s:string)=>string}){
 const {db,appId,repo,graph,encrypt}=deps,fence=createMetaGrantFence();
 function replay(row:InvitationRecord,digest:string){if(row.selectionHash!==digest)throw new HttpError(409,'The accepted Page selection cannot change');if(!row.result)throw new HttpError(503,'Import receipt unavailable');return row.result as InvitationResult;}
 function available(row:InvitationRecord){if(row.appId!==appId||!['authorized_pending_selection','importing'].includes(row.status)||invitationDeadline(row)<=new Date())throw unavailable();}
 async function admission(tx:Prisma.TransactionClient,ctx:InvitationContext,id:string,envelope:CandidateEnvelope){
  if(envelope.appId!==appId)throw unavailable();const barrier=await fence.lockAndRead(tx,{platform:'facebook',appId},envelope.providerUserId);
  if(barrier&&new Date(envelope.authorizationStartedAt)<=barrier.cutoff)throw unavailable();
  await lockInvitationCreator(tx,ctx);await requireInvitationAccess(tx,ctx,id);
  await tx.$queryRaw`SELECT id FROM "FacebookPageImportInvitation" WHERE id=${id}::uuid FOR UPDATE`;
  const row=await tx.facebookPageImportInvitation.findUniqueOrThrow({where:{id}});
  if(row.authorizerSubjectHash!==fence.subjectHash({platform:'facebook',appId},envelope.providerUserId)||row.authorizationStartedAt?.toISOString()!==envelope.authorizationStartedAt)throw unavailable();return row;
 }
 async function currentExisting(ctx:InvitationContext,ids:string[]){return new Set((await db.socialAccount.findMany({where:{workspaceId:ctx.workspaceId,platform:'facebook',providerAccountId:{in:ids}},select:{providerAccountId:true}})).map(p=>p.providerAccountId));}
 async function summary(ctx:InvitationContext,row:InvitationRecord){
  const base=invitationSummary(row);
  if(row.status==='awaiting_authorization'&&row.diagnosticId==='page_directory_read_failed')base.authorizationOutcome='read_failed';
  if(row.status==='authorized_pending_selection'&&invitationDeadline(row)>new Date()){
   let envelope:CandidateEnvelope;
   try{envelope=await repo.candidates(row);}catch(error){
    if(!(error instanceof HttpError)||error.statusCode!==410)throw error;
    const current=await db.facebookPageImportInvitation.findUnique({where:{id:row.id}});
    if(current&&(current.version!==row.version||current.status!==row.status||invitationDeadline(current)<=new Date()))return invitationSummary(current);
    throw error;
   }
   const ids=[...envelope.pages,...envelope.rejected].map(p=>p.pageId);
   if(!ids.length)base.authorizationOutcome='no_new_pages';
   else{const existing=await currentExisting(ctx,ids);if(ids.every(id=>existing.has(id)))base.authorizationOutcome='all_existing';}
  }
  return base;
 }
 async function confirm(ctx:InvitationContext,id:string,input:string[],empty=false):Promise<InvitationResult>{
  const ids=empty?[]:[...new Set(idsSchema.parse(input))].sort(),digest=hash(ids),before=await repo.readPrivate(ctx,id);
  if(before.status==='completed')return replay(before,digest);available(before);
  const envelope=await repo.candidates(before),candidates=new Set([...envelope.pages,...envelope.rejected].map(p=>p.pageId));
  if(ids.some(id=>!candidates.has(id)))throw new HttpError(400,'Selection contains an unauthorized Page');
  const existing=await currentExisting(ctx,[...candidates]);
  if(empty&&envelope.pages.some(p=>!existing.has(p.pageId)&&(!p.expiresAt||p.expiresAt>new Date())))throw new HttpError(409,'Choose new Pages before completing');
  const newPages=ids.filter(id=>!existing.has(id)).map(id=>{const p=envelope.pages.find(p=>p.pageId===id);if(!p)throw new HttpError(400,'Page authorization unavailable');return p;});
  const claimed=await db.$transaction(async tx=>{
   const row=await admission(tx,ctx,id,envelope);if(row.status==='completed')return row;available(row);
   if(row.selectionHash&&row.selectionHash!==digest)throw new HttpError(409,'The accepted Page selection cannot change');
   return tx.facebookPageImportInvitation.update({where:{id},data:{status:'importing',selectionHash:digest,selectedPageIds:ids}});
  });
  if(claimed.status==='completed')return replay(claimed,digest);
  const verified=await graph.revalidate(newPages);
  return db.$transaction(async tx=>{
   const row=await admission(tx,ctx,id,envelope);if(row.status==='completed')return replay(row,digest);available(row);
   if(row.version!==claimed.version||row.selectionHash!==digest)throw new HttpError(409,'Page import changed');
   const assertCurrent=async()=>{await requireInvitationAccess(tx,ctx,id);if(invitationDeadline(row)<=new Date())throw unavailable();};
   let result:InvitationResult;
   if(empty){
    const nowExisting=new Set((await tx.socialAccount.findMany({where:{workspaceId:ctx.workspaceId,platform:'facebook',providerAccountId:{in:[...candidates]}},select:{providerAccountId:true}})).map(p=>p.providerAccountId));
    if(envelope.pages.some(p=>!nowExisting.has(p.pageId)&&(!p.expiresAt||p.expiresAt>new Date())))throw new HttpError(409,'New Pages remain');
    result={createdPageIds:[],skippedPageIds:[...candidates].filter(id=>nowExisting.has(id)).sort()};
   }else result=await insertNewFacebookPages(tx,{workspaceId:ctx.workspaceId,operationId:id,selectedPageIds:ids,verifiedPages:verified,encrypt,assertCurrent});
   await assertCurrent();await tx.facebookPageImportCandidate.deleteMany({where:{invitationId:id}});
   await tx.facebookPageImportInvitation.update({where:{id},data:{...terminalFields('completed',new Date()),result}});return result;
  },{timeout:30000,maxWait:10000});
 }
 return{
  create:(ctx:InvitationContext,input:{note?:string})=>repo.createInvitation(ctx,input.note??''),
  async list(ctx:InvitationContext,cursor?:string){
   await requireInvitationAccess(db,ctx);let after:{date:string;id:string}|undefined;
   if(cursor){try{after=z.object({date:z.string().datetime(),id:z.string().uuid()}).strict().parse(JSON.parse(Buffer.from(cursor,'base64url').toString()));}catch{throw new HttpError(400,'Invalid Page import cursor');}}
   const rows=await db.facebookPageImportInvitation.findMany({where:{workspaceId:ctx.workspaceId,createdById:ctx.userId,OR:[{retentionExpiresAt:null},{retentionExpiresAt:{gt:new Date()}}],...(after?{AND:[{OR:[{createdAt:{lt:new Date(after.date)}},{createdAt:new Date(after.date),id:{lt:after.id}}]}]}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:21});
   const items=rows.slice(0,20),last=items.at(-1);return{items:await Promise.all(items.map(row=>summary(ctx,row))),nextCursor:rows.length>20&&last?Buffer.from(JSON.stringify({date:last.createdAt.toISOString(),id:last.id})).toString('base64url'):null};
  },
  async view(ctx:InvitationContext,id:string):Promise<InvitationView>{
   const row=await repo.readPrivate(ctx,id),base=await summary(ctx,row);
   if(!['authorized_pending_selection','importing'].includes(row.status))return{...base,pages:[],selectedPageIds:Array.isArray(row.selectedPageIds)?row.selectedPageIds as string[]:undefined};
   const e=await repo.candidates(row),existing=await currentExisting(ctx,[...e.pages,...e.rejected].map(p=>p.pageId));
   return{...base,selectedPageIds:Array.isArray(row.selectedPageIds)?row.selectedPageIds as string[]:undefined,pages:[...e.pages.map(p=>({pageId:p.pageId,name:p.name,avatarUrl:p.avatarUrl,profileUrl:p.profileUrl,existing:existing.has(p.pageId),eligible:!p.expiresAt||p.expiresAt>new Date()})),...e.rejected.map(p=>({...p,existing:existing.has(p.pageId)}))]};
  },
  confirm:(ctx:InvitationContext,id:string,ids:string[])=>confirm(ctx,id,ids),
  completeEmpty:(ctx:InvitationContext,id:string)=>confirm(ctx,id,[],true),
  async revoke(ctx:InvitationContext,id:string){
   await repo.readPrivate(ctx,id);await db.$transaction(async tx=>{await lockInvitationCreator(tx,ctx);await requireInvitationAccess(tx,ctx,id);await tx.$queryRaw`SELECT id FROM "FacebookPageImportInvitation" WHERE id=${id}::uuid FOR UPDATE`;
    const row=await tx.facebookPageImportInvitation.findUniqueOrThrow({where:{id}});if(row.status==='completed')throw new HttpError(409,'Completed imports cannot be revoked');
    if(row.status==='revoked')return;await tx.facebookPageImportCandidate.deleteMany({where:{invitationId:id}});await tx.facebookPageImportInvitation.update({where:{id},data:{...terminalFields('revoked',new Date()),revokedAt:new Date()}});
   });return{revoked:true};
  }
 };
}
