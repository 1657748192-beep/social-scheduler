import type {PrismaClient,Prisma} from '@prisma/client';
import {HttpError} from '../utils/errors';
import {isPlatformAdmin} from '../utils/platformAdmin';
import {LOGIN_SESSION_MAX_AGE_MS} from '../utils/sessionLifetime';
import type {Capability,Scope,ResolvedAsset,SourceRef} from './types';
import {platforms} from './types';
import {parseInboxSource} from './source';
import {createLiveInboxPolicy,type LiveInboxPolicy} from './livePolicy';
import {inboxSourceAlive} from './sourceLifetime';
export type InboxDb=PrismaClient|Prisma.TransactionClient;
// Compatibility boundary for existing Facebook-only callers. Never parses Instagram.
export const sourceSchema={parse:(value:unknown)=>parseInboxSource(value,'facebook')};
export async function requireInboxAccess(db:InboxDb,ctx:Scope,mode:'read'|'write'|'manage'='read'){
 const [session,member,user]=await Promise.all([db.userSession.findFirst({where:{id:ctx.sessionId,userId:ctx.userId,revokedAt:null,expiresAt:{gt:new Date()},createdAt:{gt:new Date(Date.now()-LOGIN_SESSION_MAX_AGE_MS)}}}),db.workspaceMember.findFirst({where:{userId:ctx.userId,workspaceId:ctx.workspaceId,status:'active'}}),db.user.findUnique({where:{id:ctx.userId},select:{email:true}})]);
 if(!session||!member||!user||!isPlatformAdmin(user.email)||(mode==='write'&&member.role==='viewer')||(mode==='manage'&&!['owner','admin'].includes(member.role)))throw new HttpError(403,'Interaction inbox access denied');
 return member;
}
export function createInboxAccess(deps:{db:PrismaClient;facebookEnabled:boolean;policy?:LiveInboxPolicy;verifyFacebook:(ctx:Scope&{managedPageId:string})=>Promise<Record<string,{status:string}>>}){
 const {db}=deps,policy=deps.policy??createLiveInboxPolicy([]);
 async function resolveInboxAsset(ctx:Scope,accountId:string,capability?:Capability):Promise<ResolvedAsset>{
  await requireInboxAccess(db,ctx,capability?.endsWith('.reply')?'write':'read');
  const account=await db.socialAccount.findFirst({where:{id:accountId,workspaceId:ctx.workspaceId}});
  if(!account||!platforms.includes(account.platform as any))throw new HttpError(404,'Account unavailable');
  if(account.status!=='active')throw new HttpError(403,'Account unavailable');
  if(account.platform!=='facebook')throw new HttpError(409,'Platform not integrated');
  if(!deps.facebookEnabled)throw new HttpError(409,'Interaction integration is disabled');
  const selection=await db.facebookManagementPageSelection.findUnique({where:{workspaceId_pageId:{workspaceId:ctx.workspaceId,pageId:account.providerAccountId}},include:{page:{include:{connection:true}}}});
  const page=selection?.page,c=page?.connection;
  if(!page||!c||c.workspaceId!==ctx.workspaceId||c.status!=='active'||!page.active||!page.pageTokenEncrypted||!c.userTokenEncrypted||!page.tasks.length||page.expiresAt&&page.expiresAt<=new Date()||c.expiresAt&&c.expiresAt<=new Date()||account.accountType!=='page')throw new HttpError(404,'Independent interaction connection unavailable');
  policy.requireAsset({workspaceId:ctx.workspaceId,platform:'facebook',appId:c.appId,providerAssetId:page.pageId},capability?.endsWith('.reply')?'send':'read');
  const owner=await db.workspaceMember.findFirst({where:{workspaceId:ctx.workspaceId,userId:c.userId,status:'active',role:{in:['owner','admin']}}});if(!owner)throw new HttpError(404,'Independent interaction connection unavailable');
  const grants=await deps.verifyFacebook({...ctx,managedPageId:page.id});
  const key=capability==='comments.read'?'readComments':capability==='comments.reply'?'replyComments':capability==='messages.read'?'readMessages':capability==='messages.reply'?'replyMessages':null;
  if(capability&&(!key||grants[key]?.status!=='available'))throw new HttpError(403,'Interaction permission unavailable');
  await requireInboxAccess(db,ctx,capability?.endsWith('.reply')?'write':'read');
  return{ctx,accountId,platform:'facebook',canonicalKey:JSON.stringify(['facebook',c.appId,page.pageId]),appNamespace:c.appId,providerAssetId:page.pageId,connectionVersion:c.version,sourceRef:{platform:'facebook',managedPageId:page.id,connectionId:c.id,connectionVersion:c.version}};
 }
 async function resolveCase(ctx:Scope,id:string,mode:'read'|'write'='read',tx:InboxDb=db){
  await requireInboxAccess(tx,ctx,mode);
  const row=await tx.interactionCase.findFirst({where:{id,workspaceId:ctx.workspaceId},include:{asset:true,customer:{include:{identities:true}}}});
  if(!row||!row.asset.active)throw new HttpError(404,'Interaction unavailable');
  const account=await tx.socialAccount.findFirst({where:{workspaceId:ctx.workspaceId,platform:row.asset.platform as any,providerAccountId:row.asset.providerAssetId,status:'active'}});
  if(!account)throw new HttpError(404,'Interaction unavailable');
  const resolved=await resolveInboxAsset(ctx,account.id,`${row.kind}.read` as Capability),source=sourceSchema.parse(row.sourceRef);
  if(!await inboxSourceAlive(tx,source,row.createdAt))throw new HttpError(404,'Interaction source expired or deleted');
  const current=sourceSchema.parse(resolved.sourceRef);
  if(resolved.canonicalKey!==row.asset.canonicalKey||resolved.connectionVersion!==row.asset.connectionVersion||source.connectionVersion!==resolved.connectionVersion||source.connectionId!==current.connectionId||source.managedPageId!==current.managedPageId)throw new HttpError(404,'Interaction connection changed');
  return{row,asset:resolved,source};
 }
 async function write<T>(ctx:Scope,action:(tx:Prisma.TransactionClient)=>Promise<T>,mode:'write'|'manage'='write'){
  await requireInboxAccess(db,ctx,mode);
  return db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM user_sessions WHERE id=${ctx.sessionId}::uuid FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM workspace_members WHERE user_id=${ctx.userId}::uuid AND workspace_id=${ctx.workspaceId}::uuid FOR UPDATE`;
   await requireInboxAccess(tx,ctx,mode);const value=await action(tx);await requireInboxAccess(tx,ctx,mode);return value;
  },{timeout:30000});
 }
 return{require:(ctx:Scope,mode:'read'|'write'|'manage'='read')=>requireInboxAccess(db,ctx,mode),resolveInboxAsset,resolveCase,write};
}
export type InboxAccess=ReturnType<typeof createInboxAccess>;
