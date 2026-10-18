import type {MetaDeletionNamespace} from './metaDeletionRoutes';
export type MetaDeletionBinding={namespace:MetaDeletionNamespace;prefix:string;statusBaseUrl:string;secret:string};

/** Server-only namespaces. No app ID, callback path or secret comes from a request. */
export function getMetaInboxLifecycleConfig(env:NodeJS.ProcessEnv):{enabled:boolean;bindings:MetaDeletionBinding[]}{
 const flag=env.META_INBOX_DELETION_ENABLED;
 if(flag===undefined||flag==='false')return{enabled:false,bindings:[]};
 const invalid=()=>new Error('Meta deletion configuration unavailable');
 if(flag!=='true')throw invalid();
 let origin:string;try{const u=new URL(env.API_PUBLIC_URL??env.PUBLIC_API_URL??'');if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw invalid();origin=u.origin;}catch{throw invalid();}
 const bindings:MetaDeletionBinding[]=[];
 for(const platform of ['facebook','instagram'] as const){
  const stem=platform.toUpperCase(),appId=env[stem+'_CLIENT_ID']?.trim()??'',secret=env[stem+'_CLIENT_SECRET']?.trim()??'';
  if(!appId&&!secret)continue;
  if(!/^\d{1,256}$/.test(appId)||secret.length<16)throw invalid();
  const prefix='/api/v1/meta-lifecycle/'+platform;bindings.push({namespace:{platform,appId},prefix,statusBaseUrl:origin+prefix+'/status',secret});
 }
 if(!bindings.length)throw invalid();return{enabled:true,bindings};
}
