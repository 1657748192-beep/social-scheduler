import type {PrismaClient} from '@prisma/client';
import {config} from '../config';
import {isPlatformAdmin} from '../utils/platformAdmin';
import {HttpError} from '../utils/errors';
import {prisma} from '../prisma';
import {encryptToken,decryptToken} from '../utils/tokenCrypto';
import {createFacebookEngagementClient} from '../integrations/social/facebookEngagement';
import {getFacebookManagementConfig,type FacebookManagementConfig} from './config';
import {createFacebookManagementStore} from './store';
import {createFacebookManagementOAuth} from './oauth';
import {createFacebookManagementGateway} from './oauthGateway';
import {createFacebookDirectoryClient,FacebookDirectoryError} from './graphDirectory';
import {createFacebookDirectoryService} from './directory';
import {createFacebookPageAccess,requireManagementMember} from './access';
import {createFacebookSendExecutor} from './sendAttempts';
import {createFacebookManagementEngagement} from './engagement';
import type {ManagementContext} from './types';
import {createFacebookManagementReceptionStore} from './receptionStore';
import {createFacebookSubscriptionService} from './subscriptions';
import {createFacebookWebhookRouter} from '../routes/facebookWebhookRoutes';

export function createFacebookManagementRuntime(input:{db:PrismaClient;settings:FacebookManagementConfig;appSecret:string;verifyToken?:string;encrypt:(v:string)=>string;decrypt:(v:string)=>string;fetchImpl?:typeof fetch}){
  const {db,settings,appSecret}=input;
  const store=createFacebookManagementStore(db,input.encrypt);
  const receptionStore=createFacebookManagementReceptionStore({db,appId:settings.appId});
  const gateway=createFacebookManagementGateway({config:settings,appSecret,fetchImpl:input.fetchImpl});
  const oauth=createFacebookManagementOAuth({store,config:settings,exchange:gateway.exchange,authorizeUser:async ctx=>{
    const user=await db.user.findUnique({where:{id:ctx.userId},select:{email:true}});
    if(!user||!isPlatformAdmin(user.email))throw new HttpError(403,'Platform administrator required');
  }});
  function directoryClient(connection:{appId:string;userToken:string}){
    if(connection.appId!==settings.appId)throw new FacebookDirectoryError('authorization_invalid');
    return createFacebookDirectoryClient({appId:settings.appId,appSecret,apiVersion:settings.graphVersion,userToken:connection.userToken,fetchImpl:input.fetchImpl});
  }
  const directory=createFacebookDirectoryService({db,decrypt:input.decrypt,encrypt:input.encrypt,createClient:directoryClient});
  const access=createFacebookPageAccess({db,decrypt:input.decrypt,inspect:async(pageId,token,connection)=>{
    if(!connection?.userTokenEncrypted)throw new FacebookDirectoryError('authorization_invalid');
    return directoryClient({...connection,userToken:input.decrypt(connection.userTokenEncrypted)}).inspectPageToken(pageId,token);
  }});
  const engagement=createFacebookManagementEngagement({db,resolvePageAccess:access.resolvePageAccess,executeFacebookSend:createFacebookSendExecutor({db}).executeFacebookSend,
    receivedMessages:receptionStore.messages,receivedComments:receptionStore.comments,latestInbound:receptionStore.latestInbound,
    createClient:({pageId,accessToken})=>createFacebookEngagementClient({pageId,accessToken,apiVersion:settings.graphVersion,fetchImpl:input.fetchImpl})});
  const notifications=createFacebookSubscriptionService({db,appId:settings.appId,resolvePageAccess:access.resolvePageAccess,createClient:access=>createFacebookEngagementClient({pageId:access.pageId,accessToken:access.pageToken,apiVersion:settings.graphVersion,appId:settings.appId,fetchImpl:input.fetchImpl})});
  const webhook=createFacebookWebhookRouter({enabled:()=>settings.enabled,appSecret,verifyToken:input.verifyToken??'',onEvents:receptionStore.enqueue,
    onDiagnostic:value=>console.info('Facebook management webhook',JSON.stringify(value))});
  return {enabled:settings.enabled,configured:settings.enabled,oauth,directory,engagement,notifications,receptionStore,webhook,
    member:(ctx:ManagementContext)=>requireManagementMember(db,ctx),
    async connections(ctx:ManagementContext){
      await requireManagementMember(db,ctx);
      const rows=await db.facebookManagementConnection.findMany({where:{workspaceId:ctx.workspaceId},select:{id:true,userId:true,status:true,expiresAt:true,directoryReadAt:true,createdAt:true,user:{select:{name:true}}},orderBy:{createdAt:'desc'}});
      return rows.map(row=>({id:row.id,authorizedBy:row.user.name,ownConnection:row.userId===ctx.userId,status:row.expiresAt&&row.expiresAt<=new Date()?'expired':row.status,lastReadAt:row.directoryReadAt?.toISOString()??null,createdAt:row.createdAt.toISOString()}));
    },
    async disconnect(ctx:ManagementContext,id:string){await store.disconnect(ctx,id);return{disconnected:true};}
  };
}
export type FacebookManagementRuntime=ReturnType<typeof createFacebookManagementRuntime>;
export const facebookManagementRuntime=createFacebookManagementRuntime({db:prisma,settings:getFacebookManagementConfig(process.env),appSecret:config.FACEBOOK_CLIENT_SECRET,verifyToken:config.FACEBOOK_WEBHOOK_VERIFY_TOKEN,encrypt:encryptToken,decrypt:decryptToken});
