import type {PrismaClient} from '@prisma/client';
import {HttpError} from '../utils/errors';
import {isPlatformAdmin} from '../utils/platformAdmin';
import type {InboxDb} from './access';
import type {Scope,ResolvedAsset,Capability} from './types';
import {parseInboxSource} from './source';
import type {LiveInboxPolicy} from './livePolicy';
import type {createInstagramManagementAccess} from '../instagramManagement/access';
export type InboxInstagramConnection={enabled:boolean;access:ReturnType<typeof createInstagramManagementAccess>};

export function createInboxConnectionAccess(deps:{db:PrismaClient;facebookEnabled:boolean;instagram?:InboxInstagramConnection;policy:LiveInboxPolicy;authorize:(db:InboxDb,ctx:Scope,mode?:'read'|'write'|'manage')=>Promise<unknown>;verifyFacebook:(ctx:Scope&{managedPageId:string})=>Promise<Record<string,{status:string}>>}){
 const {db,policy,authorize}=deps;
 function hasTask(tasks:string[],capability?:Capability){
  const required=capability?.startsWith('comments.')?['MODERATE']:capability==='messages.reply'?['MESSAGING']:capability==='messages.read'?['MESSAGING','MODERATE']:null;
  return required?required.some(task=>tasks.includes(task)):tasks.length>0;
 }
 async function requireOwner(store:InboxDb,ctx:Scope,userId:string){
  const member=await store.workspaceMember.findFirst({where:{workspaceId:ctx.workspaceId,userId,status:'active',role:{in:['owner','admin']}},include:{user:{select:{email:true}}}});
  if(!member||!isPlatformAdmin(member.user.email))throw new HttpError(404,'Independent interaction authorizer unavailable');
 }
 async function resolve(ctx:Scope,accountId:string,capability?:Capability):Promise<ResolvedAsset>{
  const mode=capability?.endsWith('.reply')?'write':'read';await authorize(db,ctx,mode);
  const account=await db.socialAccount.findFirst({where:{id:accountId,workspaceId:ctx.workspaceId}});
  if(!account)throw new HttpError(404,'Account unavailable');
  if(account.status!=='active')throw new HttpError(403,'Account unavailable');
  if(account.platform==='instagram'&&deps.instagram?.enabled)return deps.instagram.access.resolve(ctx,accountId,capability);
  if(account.platform!=='facebook')throw new HttpError(409,'Platform not integrated');
  if(!deps.facebookEnabled)throw new HttpError(409,'Interaction integration is disabled');
  const selected=await db.facebookManagementPageSelection.findUnique({where:{workspaceId_pageId:{workspaceId:ctx.workspaceId,pageId:account.providerAccountId}},include:{page:{include:{connection:true}}}}),p=selected?.page,c=p?.connection;
  if(!p||!c||c.workspaceId!==ctx.workspaceId||c.status!=='active'||!p.active||!p.pageTokenEncrypted||!c.userTokenEncrypted||!p.tasks.length||p.expiresAt&&p.expiresAt<=new Date()||c.expiresAt&&c.expiresAt<=new Date()||account.accountType!=='page')throw new HttpError(404,'Independent interaction connection unavailable');
  policy.requireAsset({workspaceId:ctx.workspaceId,platform:'facebook',appId:c.appId,providerAssetId:p.pageId},capability?.endsWith('.reply')?'send':'read');
  await requireOwner(db,ctx,c.userId);
  const grants=await deps.verifyFacebook({...ctx,managedPageId:p.id});
  const key=capability==='comments.read'?'readComments':capability==='comments.reply'?'replyComments':capability==='messages.read'?'readMessages':capability==='messages.reply'?'replyMessages':null;
  if(capability&&(!key||grants[key]?.status!=='available'))throw new HttpError(403,'Interaction permission unavailable');
  await authorize(db,ctx,mode);await requireOwner(db,ctx,c.userId);
  const current=await db.facebookManagedPage.findFirst({where:{id:p.id,connectionId:c.id,pageId:account.providerAccountId,active:true,connection:{workspaceId:ctx.workspaceId,appId:c.appId,status:'active',version:c.version}},include:{connection:true}});
  if(!current||!current.pageTokenEncrypted||!current.connection.userTokenEncrypted||!hasTask(current.tasks,capability)||current.expiresAt&&current.expiresAt<=new Date()||current.connection.expiresAt&&current.connection.expiresAt<=new Date())throw new HttpError(404,'Independent interaction connection changed');
  const selection=await db.facebookManagementPageSelection.findUnique({where:{workspaceId_pageId:{workspaceId:ctx.workspaceId,pageId:account.providerAccountId}}});
  if(selection?.managedPageId!==p.id)throw new HttpError(404,'Independent interaction selection changed');
  return{ctx,accountId,platform:'facebook',canonicalKey:JSON.stringify(['facebook',c.appId,p.pageId]),appNamespace:c.appId,providerAssetId:p.pageId,connectionVersion:c.version,sourceRef:{platform:'facebook',managedPageId:p.id,connectionId:c.id,connectionVersion:c.version}};
 }
 async function assertCurrent(tx:InboxDb,a:ResolvedAsset,capability?:Capability){
  if(a.platform==='instagram'&&deps.instagram?.enabled)return deps.instagram.access.assertCurrent(tx,a,capability);
  await authorize(tx,a.ctx,capability?.endsWith('.reply')?'write':'read');if(!deps.facebookEnabled||a.platform!=='facebook')throw new HttpError(409,'Platform not integrated');
  policy.requireAsset({workspaceId:a.ctx.workspaceId,platform:'facebook',appId:a.appNamespace,providerAssetId:a.providerAssetId},capability?.endsWith('.reply')?'send':'read');
  const s=parseInboxSource(a.sourceRef,'facebook');
  // No network calls while these locks fence disconnect/reselection and namespace changes.
  await tx.$queryRaw`SELECT id FROM social_accounts WHERE id=${a.accountId}::uuid AND workspace_id=${a.ctx.workspaceId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM facebook_management_connections WHERE id=${s.connectionId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM facebook_managed_pages WHERE id=${s.managedPageId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM facebook_management_page_selections WHERE "workspaceId"=${a.ctx.workspaceId}::uuid AND "pageId"=${a.providerAssetId} FOR UPDATE`;
  const p=await tx.facebookManagedPage.findFirst({where:{id:s.managedPageId,pageId:a.providerAssetId,active:true,connectionId:s.connectionId,connection:{workspaceId:a.ctx.workspaceId,appId:a.appNamespace,status:'active',version:a.connectionVersion}},include:{connection:true}});
  const selected=await tx.facebookManagementPageSelection.findUnique({where:{workspaceId_pageId:{workspaceId:a.ctx.workspaceId,pageId:a.providerAssetId}}});
  const account=await tx.socialAccount.findFirst({where:{id:a.accountId,workspaceId:a.ctx.workspaceId,platform:'facebook',providerAccountId:a.providerAssetId,status:'active',accountType:'page'}});
  if(!p||!account||selected?.managedPageId!==p.id||!p.pageTokenEncrypted||!p.connection.userTokenEncrypted||!hasTask(p.tasks,capability)||p.expiresAt&&p.expiresAt<=new Date()||p.connection.expiresAt&&p.connection.expiresAt<=new Date()||s.connectionVersion!==a.connectionVersion||a.canonicalKey!==JSON.stringify(['facebook',a.appNamespace,a.providerAssetId]))throw new HttpError(404,'Independent interaction connection changed');
  await requireOwner(tx,a.ctx,p.connection.userId);
 }
 return{resolve,assertCurrent};
}
export type InboxConnectionAccess=ReturnType<typeof createInboxConnectionAccess>;
