import type {PrismaClient,Prisma} from '@prisma/client';
import {HttpError} from '../utils/errors';
import {isPlatformAdmin} from '../utils/platformAdmin';
import {LOGIN_SESSION_MAX_AGE_MS} from '../utils/sessionLifetime';
import type {Capability,Scope} from './types';
import {parseInboxSource} from './source';
import {createLiveInboxPolicy,type LiveInboxPolicy} from './livePolicy';
import {createInboxConnectionAccess,type InboxConnectionAccess,type InboxInstagramConnection} from './connectionAccess';
import {inboxSourceAlive} from './sourceLifetime';
export type InboxDb=PrismaClient|Prisma.TransactionClient;
// Compatibility boundary for existing Facebook-only callers. Never parses Instagram.
export const sourceSchema={parse:(value:unknown)=>parseInboxSource(value,'facebook')};
export async function requireInboxAccess(db:InboxDb,ctx:Scope,mode:'read'|'write'|'manage'='read'){
 const [session,member,user]=await Promise.all([db.userSession.findFirst({where:{id:ctx.sessionId,userId:ctx.userId,revokedAt:null,expiresAt:{gt:new Date()},createdAt:{gt:new Date(Date.now()-LOGIN_SESSION_MAX_AGE_MS)}}}),db.workspaceMember.findFirst({where:{userId:ctx.userId,workspaceId:ctx.workspaceId,status:'active'}}),db.user.findUnique({where:{id:ctx.userId},select:{email:true}})]);
 if(!session||!member||!user||!isPlatformAdmin(user.email)||(mode==='write'&&member.role==='viewer')||(mode==='manage'&&!['owner','admin'].includes(member.role)))throw new HttpError(403,'Interaction inbox access denied');
 return member;
}
export function createInboxAccess(deps:{db:PrismaClient;facebookEnabled:boolean;instagram?:InboxInstagramConnection;policy?:LiveInboxPolicy;connections?:InboxConnectionAccess;verifyFacebook:(ctx:Scope&{managedPageId:string})=>Promise<Record<string,{status:string}>>}){
 const {db}=deps,policy=deps.policy??createLiveInboxPolicy([]);
 const connections=deps.connections??createInboxConnectionAccess({...deps,policy,authorize:requireInboxAccess});
 const resolveInboxAsset=connections.resolve;
 async function resolveCase(ctx:Scope,id:string,mode:'read'|'write'='read',tx:InboxDb=db){
  await requireInboxAccess(tx,ctx,mode);
  const row=await tx.interactionCase.findFirst({where:{id,workspaceId:ctx.workspaceId},include:{asset:true,customer:{include:{identities:true}}}});
  if(!row||!row.asset.active)throw new HttpError(404,'Interaction unavailable');
  const account=await tx.socialAccount.findFirst({where:{workspaceId:ctx.workspaceId,platform:row.asset.platform as any,providerAccountId:row.asset.providerAssetId,status:'active'}});
  if(!account)throw new HttpError(404,'Interaction unavailable');
  const resolved=await resolveInboxAsset(ctx,account.id,`${row.kind}.read` as Capability);
  if(resolved.platform!=='facebook'&&resolved.platform!=='instagram')throw new HttpError(409,'Platform not integrated');
  const source=parseInboxSource(row.sourceRef,resolved.platform);
  if(!await inboxSourceAlive(tx,source,row.lastInboundAt??row.createdAt,new Date(),policy))throw new HttpError(404,'Interaction source expired or deleted');
  const current=parseInboxSource(resolved.sourceRef,resolved.platform);
  if(resolved.canonicalKey!==row.asset.canonicalKey||resolved.connectionVersion!==row.asset.connectionVersion||source.connectionVersion!==resolved.connectionVersion||source.connectionId!==current.connectionId||source.platform!==current.platform||source.platform==='facebook'&&current.platform==='facebook'&&source.managedPageId!==current.managedPageId||source.platform==='instagram'&&current.platform==='instagram'&&source.instagramAccountId!==current.instagramAccountId)throw new HttpError(404,'Interaction connection changed');
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
 return{require:(ctx:Scope,mode:'read'|'write'|'manage'='read')=>requireInboxAccess(db,ctx,mode),resolveInboxAsset,resolveCase,write,assertCurrent:connections.assertCurrent};
}
export type InboxAccess=ReturnType<typeof createInboxAccess>;
