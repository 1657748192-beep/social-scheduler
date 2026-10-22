import {prisma} from '../prisma';
import {encryptToken,decryptToken} from '../utils/tokenCrypto';
import {createLiveInboxPolicy,parseLiveAssetRules} from '../interactionInbox/livePolicy';
import {getInstagramManagementConfig} from './config';
import {createInstagramManagementRuntime,type InstagramManagementRuntime} from './runtime';
import type {PrismaClient} from '@prisma/client';
import {createMetaInboxDeletion} from '../interactionInbox/deletion';
import {getMetaInboxLifecycleConfig} from '../interactionInbox/lifecycleConfig';
import {createInstagramGrantInspector} from './grantInspection';
import {parseInstagramReplyRecording} from './replyRecording';
let runtime:InstagramManagementRuntime|undefined;
export function getInstagramManagementRuntime(){
 if(runtime)return runtime;
 runtime=createConfiguredInstagramManagementRuntime({db:prisma,env:process.env,encrypt:encryptToken,decrypt:decryptToken});return runtime;
}
export function createConfiguredInstagramManagementRuntime({db,env,encrypt,decrypt,fetchImpl}:{db:PrismaClient;env:NodeJS.ProcessEnv;encrypt:(value:string)=>string;decrypt:(value:string)=>string;fetchImpl?:typeof fetch}){
 const config=getInstagramManagementConfig(env),flag=env.INSTAGRAM_MANAGEMENT_RECEPTION_ENABLED,verifyToken=env.INSTAGRAM_MANAGEMENT_WEBHOOK_VERIFY_TOKEN??'';
 if(flag!==undefined&&!['true','false'].includes(flag)||flag==='true'&&(!config.enabled||verifyToken.length<16))throw new Error('Independent Instagram reception configuration is invalid');
 if(config.enabled){
  const lifecycle=getMetaInboxLifecycleConfig(env),mode=env.INSTAGRAM_MANAGEMENT_LIFECYCLE_MODE;
  const fail=()=>new Error('Independent Instagram cleanup lifecycle is unavailable');
  if(mode==='existing_app_instructions'){
   // The shared Meta app retains its existing app-wide manual deletion channel.
   // Local disconnect/content deletion and API-owned expiry remain active; do
   // not mount or register an interaction-only app-wide completion callback.
   if(lifecycle.enabled)throw fail();
   try{const u=new URL(env.INSTAGRAM_MANAGEMENT_DELETION_INSTRUCTIONS_URL??''),base=new URL(env.API_PUBLIC_URL??env.PUBLIC_API_URL??'');if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash||u.href!==base.origin+'/data-deletion')throw fail();}catch{throw fail();}
  }else if(mode!==undefined||!lifecycle.enabled||!lifecycle.bindings.some(v=>v.namespace.platform==='instagram'&&v.namespace.appId===config.appId))throw fail();
 }
 const deletion=createMetaInboxDeletion({db,encrypt,decrypt});
 return createInstagramManagementRuntime({db,config,policy:createLiveInboxPolicy(parseLiveAssetRules(env.META_INBOX_LIVE_ASSETS_JSON)),testRestriction:parseInstagramReplyRecording(env.INSTAGRAM_MANAGEMENT_REPLY_TEST_JSON),encrypt,decrypt,fetchImpl,inspect:createInstagramGrantInspector({config,fetchImpl}),reception:{enabled:flag==='true',verifyToken},isDeleted:deletion.isDeleted,
  onDeleted:(tx,s)=>deletion.markItemInTransaction(tx,s,s.eventKind,s.providerEventId),
  onDisconnect:async(tx,c)=>{await deletion.recordDisconnectInTransaction(tx,{workspaceId:c.workspaceId,platform:'instagram',appId:c.appId,providerAssetId:c.providerAccountId,connectionId:c.id,connectionVersion:c.version});}
 });
}
