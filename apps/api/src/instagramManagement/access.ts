import type {PrismaClient} from '@prisma/client';
import type {Scope,Capability,ResolvedAsset} from '../interactionInbox/types';
import type {LiveInboxPolicy} from '../interactionInbox/livePolicy';
import {requireInboxAccess} from '../interactionInbox/access';
import {isPlatformAdmin} from '../utils/platformAdmin';
import {HttpError} from '../utils/errors';
import {requireInstagramAccount} from './store';
import type {InstagramGrantInspection} from './types';

export function createInstagramManagementAccess({db,appId,policy,decrypt,inspect}:{db:PrismaClient;appId:string;policy:LiveInboxPolicy;decrypt:(value:string)=>string;inspect?:(accountId:string,token:string)=>Promise<InstagramGrantInspection>}){
 async function requireAuthorizer(ctx:Scope,userId:string){
  const owner=await db.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:ctx.workspaceId,userId}},include:{user:{select:{email:true}}}});
  if(!owner||owner.status!=='active'||!['owner','admin'].includes(owner.role)||!isPlatformAdmin(owner.user.email))throw new HttpError(409,'Independent Instagram authorizer unavailable');
 }
 async function resolveInternal(ctx:Scope,accountId:string,capability:Capability='comments.read'){
  const account=await requireInstagramAccount(db,ctx,accountId);await requireInboxAccess(db,ctx,capability.endsWith('.reply')?'write':'read');
  policy.requireAsset({workspaceId:ctx.workspaceId,platform:'instagram',appId,providerAssetId:account.providerAccountId},capability.endsWith('.reply')?'send':'read');
  if(capability==='mentions.read')throw new HttpError(409,'Instagram mentions not integrated');
  const c=await db.instagramManagementConnection.findUnique({where:{workspaceId_appId_providerAccountId:{workspaceId:ctx.workspaceId,appId,providerAccountId:account.providerAccountId}}});
  if(!c||c.status!=='active'||!c.tokenEncrypted||c.expiresAt&&c.expiresAt<=new Date())throw new HttpError(409,'Independent Instagram connection unavailable');
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
  if(!current)throw new HttpError(409,'Independent Instagram connection changed');
  const asset:ResolvedAsset={ctx,accountId,platform:'instagram',canonicalKey:JSON.stringify(['instagram',appId,account.providerAccountId]),appNamespace:appId,providerAssetId:account.providerAccountId,connectionVersion:c.version,sourceRef:{platform:'instagram',instagramAccountId:accountId,connectionId:c.id,connectionVersion:c.version}};
  return{asset,accessToken};
 }
 return{
  async resolve(ctx:Scope,accountId:string,capability?:Capability){return(await resolveInternal(ctx,accountId,capability)).asset;},
  async withAccess<T>(ctx:Scope,accountId:string,capability:Capability,action:(asset:ResolvedAsset,accessToken:string)=>Promise<T>){const {asset,accessToken}=await resolveInternal(ctx,accountId,capability);return action(asset,accessToken);}
 };
}
