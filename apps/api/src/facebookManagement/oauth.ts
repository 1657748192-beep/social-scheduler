import {randomBytes} from 'node:crypto';
import type {FacebookManagementConfig} from './config';
import type {ManagementContext} from './types';
import {ManagementAuthorizationError,type ManagementGrant,type createFacebookManagementStore} from './store';

type Dependencies={store:ReturnType<typeof createFacebookManagementStore>;config:FacebookManagementConfig;
  exchange:(code:string,callbackUrl:string)=>Promise<ManagementGrant|null>};
export function createFacebookManagementOAuth({store,config,exchange}:Dependencies){
  return {
    async start(ctx:ManagementContext,connectionId?:string){
      if(!config.enabled)throw new ManagementAuthorizationError();
      const state=randomBytes(32).toString('base64url');
      await store.createState({...ctx,appId:config.appId,state,callbackUrl:config.callbackUrl,connectionId});
      const url=new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
      url.search=new URLSearchParams({client_id:config.appId,config_id:config.loginConfigId,redirect_uri:config.callbackUrl,state,response_type:'code',override_default_response_type:'true'}).toString();
      return {authorizationUrl:url.href};
    },
    async callback({state,code}:{state:string;code:string}){
      if(!config.enabled||!/^[A-Za-z0-9_-]{43}$/.test(state))throw new ManagementAuthorizationError();
      const saved=await store.consumeState(state);
      // Consume cancellation/error callbacks too, so a denied flow cannot be replayed.
      if(!saved||!code||code.length>8192||saved.callbackUrl!==config.callbackUrl||saved.appId!==config.appId)throw new ManagementAuthorizationError();
      try{
        const grant=await exchange(code,saved.callbackUrl);
        if(!grant)throw new ManagementAuthorizationError();
        const connectionId=await store.saveGrant(saved,grant);
        if(!connectionId)throw new ManagementAuthorizationError();
        return {connectionId};
      }catch{throw new ManagementAuthorizationError();}
    }
  };
}
