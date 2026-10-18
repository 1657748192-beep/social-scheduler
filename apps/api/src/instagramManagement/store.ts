import {createHash} from 'node:crypto';
import type {PrismaClient,InstagramManagementOAuthState} from '@prisma/client';
import {HttpError} from '../utils/errors';
import {requireInboxAccess,type InboxDb} from '../interactionInbox/access';
import type {Scope} from '../interactionInbox/types';
import type {LiveInboxPolicy} from '../interactionInbox/livePolicy';
import type {InstagramManagementGrant} from './types';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function requireInstagramAccount(db:InboxDb,ctx:Scope,accountId:string,mode:'read'|'manage'='read'){
 await requireInboxAccess(db,ctx,mode);
 const account=await db.socialAccount.findFirst({where:{id:accountId,workspaceId:ctx.workspaceId,platform:'instagram',status:'active'},select:{id:true,providerAccountId:true,displayName:true,accountType:true}});
 if(!account||!/^\d{1,256}$/.test(account.providerAccountId)||!['business','creator','BUSINESS','MEDIA_CREATOR','CREATOR'].includes(account.accountType??''))throw new HttpError(404,'Independent Instagram account unavailable');
 return account;
}
export function createInstagramManagementStore({db,encrypt,policy}:{db:PrismaClient;encrypt:(value:string)=>string;policy:LiveInboxPolicy}){
 return{
  async createState(ctx:Scope,accountId:string,appId:string,state:string,callbackUrl:string){
   const account=await requireInstagramAccount(db,ctx,accountId,'manage');policy.requireAsset({workspaceId:ctx.workspaceId,platform:'instagram',appId,providerAssetId:account.providerAccountId},'read');
   return db.instagramManagementOAuthState.create({data:{workspaceId:ctx.workspaceId,userId:ctx.userId,sessionId:ctx.sessionId,accountId,appId,expectedProviderAccountId:account.providerAccountId,stateHash:hash(state),callbackUrl,expiresAt:new Date(Date.now()+600000)}});
  },
  async consumeState(state:string){
   return db.$transaction(async tx=>{
    const stateHash=hash(state),claimed=await tx.instagramManagementOAuthState.updateMany({where:{stateHash,consumedAt:null,expiresAt:{gt:new Date()}},data:{consumedAt:new Date()}});
    return claimed.count===1?tx.instagramManagementOAuthState.findUnique({where:{stateHash}}):null;
   });
  },
  async saveGrant(saved:InstagramManagementOAuthState,grant:InstagramManagementGrant){
   const ctx:Scope={workspaceId:saved.workspaceId,userId:saved.userId,sessionId:saved.sessionId};
   return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM user_sessions WHERE id=${ctx.sessionId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM workspace_members WHERE workspace_id=${ctx.workspaceId}::uuid AND user_id=${ctx.userId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM social_accounts WHERE id=${saved.accountId}::uuid FOR UPDATE`;
    const account=await requireInstagramAccount(tx,ctx,saved.accountId,'manage');
    const state=await tx.instagramManagementOAuthState.findFirst({where:{id:saved.id,workspaceId:ctx.workspaceId,sessionId:ctx.sessionId,consumedAt:{not:null},expiresAt:{gt:new Date()}}});
    if(!state||account.providerAccountId!==saved.expectedProviderAccountId||grant.providerAccountId!==saved.expectedProviderAccountId||grant.appId!==saved.appId)throw new HttpError(409,'Independent Instagram identity changed');
    policy.requireAsset({workspaceId:ctx.workspaceId,platform:'instagram',appId:grant.appId,providerAssetId:grant.providerAccountId},'read');
    const data={userId:ctx.userId,providerUserId:grant.providerUserId,tokenEncrypted:encrypt(grant.accessToken),scopes:grant.scopes,expiresAt:grant.expiresAt,displayName:grant.displayName??null,status:'active',notificationsEnabled:false,subscribedFields:[],authorizedAt:new Date()};
    const row=await tx.instagramManagementConnection.upsert({where:{workspaceId_appId_providerAccountId:{workspaceId:ctx.workspaceId,appId:grant.appId,providerAccountId:grant.providerAccountId}},create:{workspaceId:ctx.workspaceId,platform:'instagram',appId:grant.appId,providerAccountId:grant.providerAccountId,...data},update:{...data,version:{increment:1}}});
    await requireInboxAccess(tx,ctx,'manage');return row.id;
   },{timeout:15000});
  }
 };
}
