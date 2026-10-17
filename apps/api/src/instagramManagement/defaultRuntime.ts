import {prisma} from '../prisma';
import {encryptToken,decryptToken} from '../utils/tokenCrypto';
import {createLiveInboxPolicy,parseLiveAssetRules} from '../interactionInbox/livePolicy';
import {getInstagramManagementConfig} from './config';
import {createInstagramManagementRuntime,type InstagramManagementRuntime} from './runtime';
let runtime:InstagramManagementRuntime|undefined;
export function getInstagramManagementRuntime(){
 if(runtime)return runtime;
 const config=getInstagramManagementConfig(process.env),flag=process.env.INSTAGRAM_MANAGEMENT_RECEPTION_ENABLED,verifyToken=process.env.INSTAGRAM_MANAGEMENT_WEBHOOK_VERIFY_TOKEN??'';
 if(flag!==undefined&&!['true','false'].includes(flag)||flag==='true'&&(!config.enabled||verifyToken.length<16))throw new Error('Independent Instagram reception configuration is invalid');
 // No live deletion guard is supplied until the deletion/retention integration is verified.
 runtime=createInstagramManagementRuntime({db:prisma,config,policy:createLiveInboxPolicy(parseLiveAssetRules(process.env.META_INBOX_LIVE_ASSETS_JSON)),encrypt:encryptToken,decrypt:decryptToken,reception:{enabled:flag==='true',verifyToken}});
 return runtime;
}
