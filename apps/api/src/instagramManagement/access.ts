import type {PrismaClient} from '@prisma/client';
import type {Scope,Capability,ResolvedAsset} from '../interactionInbox/types';
import type {LiveInboxPolicy} from '../interactionInbox/livePolicy';
import {requireInboxAccess,type InboxDb} from '../interactionInbox/access';
import {parseInboxSource} from '../interactionInbox/source';
import {isPlatformAdmin} from '../utils/platformAdmin';
import {HttpError} from '../utils/errors';
import {requireInstagramAccount} from './store';
import type {InstagramGrantInspection} from './types';

export function createInstagramManagementAccess({db,appId,policy,decrypt,inspect}:{db:PrismaClient;appId:string;policy:LiveInboxPolicy;decrypt:(value:string)=>string;inspect?:(accountId:string,token:string)=>Promise<InstagramGrantInspection>}){
 async function requireAuthorizer(ctx:Scope,userId:string,store:InboxDb=db){
  const owner=await store.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:ctx.workspaceId,userId}},include:{user:{select:{email:true}}}});
  if(!owner||owner.status!=='active'||!['owner','admin'].includes(owner.role)||!isPlatformAdmin(owner.user.email))throw new HttpError(409,'Independent Instagram authorizer unavailable');
 }
 async function resolveInternal(ctx:Scope,accountId:string,capability?:Capability){
  const account=await requireInstagramAccount(db,ctx,accountId);await requireInboxAccess(db,ctx,capability?.endsWith('.reply')?'write':'read');
  policy.requireAsset({workspaceId:ctx.workspaceId,platform:'instagram',appId,providerAssetId:account.providerAccountId},capability?.endsWith('.reply')?'send':'read');
  if(capability==='mentions.read')throw new HttpError(409,'Instagram mentions not integrated');
  const c=await db.instagramManagementConnection.findUnique({where:{workspaceId_appId_providerAccountId:{workspaceId:ctx.workspaceId,appId,providerAccountId:account.providerAccountId}}});
  if(!c||c.status!=='active'||!c.tokenEncrypted||c.expiresAt&&c.expiresAt<=new Date())throw new HttpError(409,'Independent Instagram connection unavailable');
  capability??=c.scopes.includes('instagram_business_manage_comments')?'comments.read':'messages.read';
  await requireAuthorizer(ctx,c.userId);
  if(!inspect)throw new HttpError(409,'Independent Instagram verification unavailable');
  const needed=['instagram_business_basic',capability.startsWith('comments.')?'instagram_business_manage_comments':'instagram_business_manage_messages'];
  if(needed.some(scope=>!c.scopes.includes(scope)))throw new HttpError(403,'Independent Instagram permission unavailable');
  let proof:InstagramGrantInspection,accessToken:string;
  try{accessToken=decrypt(c.tokenEncrypted);proof=await inspect(account.providerAccountId,accessToken);}catch{throw new HttpError(409,'Independent Instagram verification unavailable');}
  if(proof.appId!==appId||proof.providerAccountId!==account.providerAccountId||!Array.isArray(proof.scopes)||needed.some(s=>!proof.scopes.includes(s))||!(proof.expiresAt instanceof Date)||!Number.isFinite(proof.expiresAt.getTime())||proof.expiresAt<=new Date())throw new HttpError(403,'Independent Instagram identity or grant unavailable');
  await requireInboxAccess(db,ctx,capability.endsWith('.reply')?'write':'read');
  await requireAuthorizer(ctx,c.userId);
  const current=await db.instagramManagementConnection.findFirst({where:{id:c.id,workspaceId:ctx.workspaceId,appId,status:'active',version:c.version,tokenEncrypted:c.tokenEncrypted}});
  if(!current||current.expiresAt&&current.expiresAt<=new Date()||needed.some(scope=>!current.scopes.includes(scope)))throw new HttpError(409,'Independent Instagram connection changed');
  const asset:ResolvedAsset={ctx,accountId,platform:'instagram',canonicalKey:JSON.stringify(['instagram',appId,account.providerAccountId]),appNamespace:appId,providerAssetId:account.providerAccountId,connectionVersion:c.version,sourceRef:{platform:'instagram',instagramAccountId:accountId,connectionId:c.id,connectionVersion:c.version}};
  return{asset,accessToken};
 }
 return{
  async assertCurrent(tx:InboxDb,a:ResolvedAsset,capability?:Capability){
   await requireInboxAccess(tx,a.ctx,capability?.endsWith('.reply')?'write':'read');
   if(a.platform!=='instagram'||a.appNamespace!==appId||capability==='mentions.read')throw new HttpError(409,'Instagram interaction unavailable');
   const s=parseInboxSource(a.sourceRef,'instagram');
   if(s.instagramAccountId!==a.accountId||s.connectionVersion!==a.connectionVersion||a.canonicalKey!==JSON.stringify(['instagram',appId,a.providerAssetId])||a.ctx.accountIds&&!a.ctx.accountIds.includes(a.accountId))throw new HttpError(404,'Instagram source unavailable');
   policy.requireAsset({workspaceId:a.ctx.workspaceId,platform:'instagram',appId,providerAssetId:a.providerAssetId},capability?.endsWith('.reply')?'send':'read');
   await tx.$queryRaw`SELECT id FROM social_accounts WHERE id=${a.accountId}::uuid AND workspace_id=${a.ctx.workspaceId}::uuid FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${s.connectionId}::uuid FOR UPDATE`;
   const account=await tx.socialAccount.findFirst({where:{id:a.accountId,workspaceId:a.ctx.workspaceId,platform:'instagram',providerAccountId:a.providerAssetId,status:'active',accountType:{in:['business','creator','BUSINESS','MEDIA_CREATOR','CREATOR']}}});
   const c=await tx.instagramManagementConnection.findFirst({where:{id:s.connectionId,workspaceId:a.ctx.workspaceId,appId,providerAccountId:a.providerAssetId,version:a.connectionVersion,status:'active',tokenEncrypted:{not:null}}});
   capability??=c?.scopes.includes('instagram_business_manage_comments')?'comments.read':'messages.read';
   const needed=['instagram_business_basic',capability.startsWith('comments.')?'instagram_business_manage_comments':'instagram_business_manage_messages'];
   if(!account||!c||c.expiresAt&&c.expiresAt<=new Date()||needed.some(v=>!c.scopes.includes(v)))throw new HttpError(404,'Independent Instagram connection changed');
   await requireAuthorizer(a.ctx,c.userId,tx);
  },
  async resolve(ctx:Scope,accountId:string,capability?:Capability){return(await resolveInternal(ctx,accountId,capability)).asset;},
  async withAccess<T>(ctx:Scope,accountId:string,capability:Capability,action:(asset:ResolvedAsset,accessToken:string)=>Promise<T>){const {asset,accessToken}=await resolveInternal(ctx,accountId,capability);return action(asset,accessToken);}
 };
}
