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
import {createMetaInboxDeletion} from '../interactionInbox/deletion';
import {parseFacebookReplyTestRestriction,type FacebookReplyTestRestriction} from './replyTestRestriction';
import {createHash} from 'node:crypto';
import {createFacebookReadInspectionGuard} from './readInspection';

export function createFacebookManagementRuntime(input:{db:PrismaClient;settings:FacebookManagementConfig;appSecret:string;verifyToken?:string;testRestriction?:FacebookReplyTestRestriction|null;encrypt:(v:string)=>string;decrypt:(v:string)=>string;fetchImpl?:typeof fetch}){
  const {db,settings,appSecret}=input;
  const deletion=createMetaInboxDeletion({db,encrypt:input.encrypt,decrypt:input.decrypt});
  const store=createFacebookManagementStore(db,input.encrypt,{onDisconnect:async(tx,c,pages)=>{for(const page of pages)await deletion.recordDisconnectInTransaction(tx,{workspaceId:c.workspaceId,platform:'facebook',appId:c.appId,providerAssetId:page.pageId,connectionId:c.id,connectionVersion:c.version});}});
  const receptionStore=createFacebookManagementReceptionStore({db,appId:settings.appId,isDeleted:deletion.isDeleted,onDeleted:async(tx,s)=>{if(s.eventKind==='comments')await deletion.markItemInTransaction(tx,s,s.eventKind,s.providerEventId);}});
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
  const inspectRead=createFacebookReadInspectionGuard();
  const access=createFacebookPageAccess({db,decrypt:input.decrypt,inspect:async(pageId,token,connection,options)=>{
    if(!connection?.userTokenEncrypted)throw new FacebookDirectoryError('authorization_invalid');
    const key=createHash('sha256').update(JSON.stringify([connection.appId,connection.id,connection.version,pageId,token,connection.userTokenEncrypted])).digest('hex');
    return inspectRead(key,()=>directoryClient({...connection,userToken:input.decrypt(connection.userTokenEncrypted!)}).inspectPageToken(pageId,token),{fresh:options?.write});
  }});
  const engagement=createFacebookManagementEngagement({db,testRestriction:input.testRestriction,resolvePageAccess:access.resolvePageAccess,onRateLimited:seconds=>inspectRead.rateLimited(seconds),executeFacebookSend:createFacebookSendExecutor({db,testRestriction:input.testRestriction}).executeFacebookSend,
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
export const facebookManagementRuntime=createFacebookManagementRuntime({db:prisma,settings:getFacebookManagementConfig(process.env),testRestriction:parseFacebookReplyTestRestriction(process.env.FACEBOOK_MANAGEMENT_REPLY_TEST_JSON),appSecret:config.FACEBOOK_CLIENT_SECRET,verifyToken:config.FACEBOOK_WEBHOOK_VERIFY_TOKEN,encrypt:encryptToken,decrypt:decryptToken});
