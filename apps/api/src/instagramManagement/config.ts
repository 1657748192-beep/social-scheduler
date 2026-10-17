import type {InstagramManagementConfig} from './types';
export function getInstagramManagementConfig(env:NodeJS.ProcessEnv):InstagramManagementConfig{
 const empty:InstagramManagementConfig={enabled:false,appId:'',appSecret:'',graphVersion:'',callbackUrl:'',requiredScopes:[]};
 if(env.INSTAGRAM_MANAGEMENT_ENABLED===undefined||env.INSTAGRAM_MANAGEMENT_ENABLED==='false')return empty;
 const fail=()=>new Error('Independent Instagram configuration is invalid');
 if(env.INSTAGRAM_MANAGEMENT_ENABLED!=='true')throw fail();
 const appId=env.INSTAGRAM_CLIENT_ID?.trim()??'',appSecret=env.INSTAGRAM_CLIENT_SECRET?.trim()??'',graphVersion=env.INSTAGRAM_MANAGEMENT_GRAPH_API_VERSION?.trim()??'',callbackUrl=env.INSTAGRAM_MANAGEMENT_CALLBACK_URL?.trim()??'';
 const requiredScopes=[...new Set((env.INSTAGRAM_MANAGEMENT_SCOPES??'').split(',').map(x=>x.trim()).filter(Boolean))];
 const allowed=['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'];
 if(!/^\d{1,256}$/.test(appId)||!appSecret||!/^v[1-9]\d?\.0$/.test(graphVersion)||!requiredScopes.includes('instagram_business_basic')||requiredScopes.length<2||requiredScopes.some(x=>!allowed.includes(x)))throw fail();
 try{const u=new URL(callbackUrl),base=new URL(env.API_PUBLIC_URL??env.PUBLIC_API_URL??'');if(u.protocol!=='https:'||u.origin!==base.origin||u.username||u.password||u.search||u.hash||u.pathname!=='/api/v1/integrations/instagram-management/oauth/callback')throw fail();}catch{throw fail();}
 return{enabled:true,appId,appSecret,graphVersion,callbackUrl,requiredScopes};
}
