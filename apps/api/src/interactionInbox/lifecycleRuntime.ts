import type {PrismaClient} from '@prisma/client';
import {prisma} from '../prisma';import {encryptToken,decryptToken} from '../utils/tokenCrypto';
import {createMetaInboxDeletion} from './deletion';import {createMetaDeletionRouter} from './metaDeletionRoutes';import {getMetaInboxLifecycleConfig} from './lifecycleConfig';
import {createMetaExpiryMaintenance} from './expiryMaintenance';import {createLiveInboxPolicy,parseLiveAssetRules} from './livePolicy';

export function createMetaInboxLifecycleRuntime({db,env,encrypt,decrypt}:{db:PrismaClient;env:NodeJS.ProcessEnv;encrypt:(value:string)=>string;decrypt:(value:string)=>string}){
 const config=getMetaInboxLifecycleConfig(env),deletion=createMetaInboxDeletion({db,encrypt,decrypt});
 const namespaces=config.bindings.map(v=>({...v.namespace})),expiry=createMetaExpiryMaintenance({db,policy:createLiveInboxPolicy(parseLiveAssetRules(env.META_INBOX_LIVE_ASSETS_JSON)),namespaces});
 const routes=config.bindings.map(binding=>({prefix:binding.prefix,router:createMetaDeletionRouter({...binding,deletion,statusStore:{status:code=>deletion.statusForNamespace(binding.namespace,code)}})}));
 return{enabled:config.enabled,namespaces,routes,deletion,maintenanceStore:{...deletion,maintenance:()=>expiry.tick()}};
}
export type MetaInboxLifecycleRuntime=ReturnType<typeof createMetaInboxLifecycleRuntime>;
let runtime:MetaInboxLifecycleRuntime|undefined;
export function getMetaInboxLifecycleRuntime(){return runtime??=createMetaInboxLifecycleRuntime({db:prisma,env:process.env,encrypt:encryptToken,decrypt:decryptToken});}
