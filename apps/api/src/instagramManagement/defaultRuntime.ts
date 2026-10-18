import {prisma} from '../prisma';
import {encryptToken,decryptToken} from '../utils/tokenCrypto';
import {createLiveInboxPolicy,parseLiveAssetRules} from '../interactionInbox/livePolicy';
import {getInstagramManagementConfig} from './config';
import {createInstagramManagementRuntime,type InstagramManagementRuntime} from './runtime';
import type {PrismaClient} from '@prisma/client';
import {createMetaInboxDeletion} from '../interactionInbox/deletion';
import {getMetaInboxLifecycleConfig} from '../interactionInbox/lifecycleConfig';
let runtime:InstagramManagementRuntime|undefined;
export function getInstagramManagementRuntime(){
 if(runtime)return runtime;
 runtime=createConfiguredInstagramManagementRuntime({db:prisma,env:process.env,encrypt:encryptToken,decrypt:decryptToken});return runtime;
}
export function createConfiguredInstagramManagementRuntime({db,env,encrypt,decrypt}:{db:PrismaClient;env:NodeJS.ProcessEnv;encrypt:(value:string)=>string;decrypt:(value:string)=>string}){
 const config=getInstagramManagementConfig(env),flag=env.INSTAGRAM_MANAGEMENT_RECEPTION_ENABLED,verifyToken=env.INSTAGRAM_MANAGEMENT_WEBHOOK_VERIFY_TOKEN??'';
 if(flag!==undefined&&!['true','false'].includes(flag)||flag==='true'&&(!config.enabled||verifyToken.length<16))throw new Error('Independent Instagram reception configuration is invalid');
 if(config.enabled){const lifecycle=getMetaInboxLifecycleConfig(env);if(!lifecycle.enabled||!lifecycle.bindings.some(v=>v.namespace.platform==='instagram'&&v.namespace.appId===config.appId))throw new Error('Independent Instagram cleanup lifecycle is unavailable');}
 const deletion=createMetaInboxDeletion({db,encrypt,decrypt});
 return createInstagramManagementRuntime({db,config,policy:createLiveInboxPolicy(parseLiveAssetRules(env.META_INBOX_LIVE_ASSETS_JSON)),encrypt,decrypt,reception:{enabled:flag==='true',verifyToken},isDeleted:deletion.isDeleted,
  onDeleted:(tx,s)=>deletion.markItemInTransaction(tx,s,s.eventKind,s.providerEventId),
  onDisconnect:async(tx,c)=>{await deletion.recordDisconnectInTransaction(tx,{workspaceId:c.workspaceId,platform:'instagram',appId:c.appId,providerAssetId:c.providerAccountId,connectionId:c.id,connectionVersion:c.version});}
 });
}
