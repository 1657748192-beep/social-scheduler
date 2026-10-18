import type {PrismaClient,Prisma,InstagramManagementConnection} from '@prisma/client';
import type {Scope} from '../interactionInbox/types';
import type {LiveInboxPolicy} from '../interactionInbox/livePolicy';
import {requireInboxAccess} from '../interactionInbox/access';
import {HttpError} from '../utils/errors';
import {requireInstagramAccount,createInstagramManagementStore} from './store';
import {createInstagramManagementOAuth} from './oauth';
import {createInstagramManagementGateway} from './oauthGateway';
import {createInstagramManagementAccess} from './access';
import type {InstagramManagementConfig,InstagramGrantInspection,InstagramManagementGrant,InstagramSourceSubject} from './types';
import {createInstagramManagementReceptionStore} from './receptionStore';
import {createInstagramManagementWebhook} from './webhook';

export function createInstagramManagementRuntime(input:{db:PrismaClient;config:InstagramManagementConfig;policy:LiveInboxPolicy;encrypt:(value:string)=>string;decrypt:(value:string)=>string;deletionHmacKey?:string;fetchImpl?:typeof fetch;exchange?:(code:string,callbackUrl:string)=>Promise<InstagramManagementGrant>;inspect?:(accountId:string,token:string)=>Promise<InstagramGrantInspection>;onDisconnect?:(tx:Prisma.TransactionClient,connection:InstagramManagementConnection)=>Promise<void>;reception?:{enabled:boolean;verifyToken:string};isDeleted?:(tx:Prisma.TransactionClient,subject:InstagramSourceSubject)=>Promise<boolean>}){
 const {db,config,policy}=input,store=createInstagramManagementStore({db,encrypt:input.encrypt,policy,hmacKey:input.deletionHmacKey});
 const gateway=createInstagramManagementGateway({config,fetchImpl:input.fetchImpl});
 const oauth=createInstagramManagementOAuth({db,config,policy,store,exchange:input.exchange??gateway.exchange});
 const receptionEnabled=!!input.reception?.enabled&&config.enabled&&!!input.isDeleted;
 const receptionStore=createInstagramManagementReceptionStore({db,appId:config.appId,enabled:receptionEnabled,policy,isDeleted:input.isDeleted??(async()=>{throw new HttpError(409,'Deletion verification unavailable');})});
 return{
  receptionEnabled,receptionStore,webhook:createInstagramManagementWebhook({appSecret:config.appSecret,verifyToken:input.reception?.verifyToken??'',store:receptionStore}),
  enabled:config.enabled,oauth,access:createInstagramManagementAccess({db,appId:config.appId,policy,decrypt:input.decrypt,inspect:input.inspect}),
  require:(ctx:Scope,mode:'read'|'manage')=>requireInboxAccess(db,ctx,mode),
  async status(ctx:Scope,accountId:string){
   const account=await requireInstagramAccount(db,ctx,accountId);
   if(!config.enabled)return{enabled:false,connected:false,status:'not_open',providerAccountId:account.providerAccountId,displayName:account.displayName,expiresAt:null};
   const c=await db.instagramManagementConnection.findUnique({where:{workspaceId_appId_providerAccountId:{workspaceId:ctx.workspaceId,appId:config.appId,providerAccountId:account.providerAccountId}}});
   let status=c?.status==='active'&&c.tokenEncrypted?'verification_required':'authorization_required';
   if(c?.expiresAt&&c.expiresAt<=new Date())status='authorization_expired';
   try{policy.requireAsset({workspaceId:ctx.workspaceId,platform:'instagram',appId:config.appId,providerAssetId:account.providerAccountId},'read');}catch{status='not_open';}
   return{enabled:true,connected:!!c?.tokenEncrypted&&c.status==='active',connectionId:c?.id??null,status,providerAccountId:account.providerAccountId,displayName:c?.displayName??account.displayName,expiresAt:c?.expiresAt?.toISOString()??null};
  },
  async disconnect(ctx:Scope,connectionId:string){
   await requireInboxAccess(db,ctx,'manage');
   // Cleanup must join this transaction before disconnect can be made available.
   if(!config.enabled||!input.onDisconnect)throw new HttpError(409,'Independent disconnect cleanup unavailable');
   return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${connectionId}::uuid AND "workspaceId"=${ctx.workspaceId}::uuid FOR UPDATE`;
    await requireInboxAccess(tx,ctx,'manage');
    const c=await tx.instagramManagementConnection.findFirst({where:{id:connectionId,workspaceId:ctx.workspaceId,appId:config.appId}});if(!c)throw new HttpError(404,'Independent connection unavailable');
    await tx.instagramManagementConnection.update({where:{id:c.id},data:{status:'disconnected',tokenEncrypted:null,version:{increment:1},notificationsEnabled:false}});
    await input.onDisconnect!(tx,c);await requireInboxAccess(tx,ctx,'manage');return{disconnected:true};
   });
  }
 };
}
export type InstagramManagementRuntime=ReturnType<typeof createInstagramManagementRuntime>;
