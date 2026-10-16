export type FacebookManagementConfig = {
  enabled:boolean; appId:string; graphVersion:string; loginConfigId:string; callbackUrl:string;
};

/** Deliberately independent of dotenv and the publishing config singleton. */
export function getFacebookManagementConfig(env:NodeJS.ProcessEnv):FacebookManagementConfig {
  const invalid=()=>new Error('Facebook management configuration is incomplete or invalid.');
  if(env.FACEBOOK_MANAGEMENT_ENABLED===undefined || env.FACEBOOK_MANAGEMENT_ENABLED==='false') {
    return {enabled:false,appId:'',graphVersion:'',loginConfigId:'',callbackUrl:''};
  }
  if(env.FACEBOOK_MANAGEMENT_ENABLED!=='true')throw invalid();
  const appId=env.FACEBOOK_CLIENT_ID?.trim()??'';
  const loginConfigId=env.FACEBOOK_MANAGEMENT_LOGIN_CONFIG_ID?.trim()??'';
  const graphVersion=env.FACEBOOK_MANAGEMENT_GRAPH_API_VERSION?.trim()??'';
  const callbackUrl=env.FACEBOOK_MANAGEMENT_CALLBACK_URL?.trim()??'';
  if(!/^\d{1,256}$/.test(appId) || !env.FACEBOOK_CLIENT_SECRET?.trim()
    || !/^\d{1,256}$/.test(loginConfigId) || !/^v[1-9]\d?\.0$/.test(graphVersion)
    || [env.FACEBOOK_LOGIN_CONFIG_ID?.trim(),env.FACEBOOK_ENGAGEMENT_LOGIN_CONFIG_ID?.trim()].includes(loginConfigId))throw invalid();
  let callback:URL, origin:URL;
  try {callback=new URL(callbackUrl);origin=new URL(env.API_PUBLIC_URL??env.PUBLIC_API_URL??'');}catch{throw invalid();}
  if(callback.protocol!=='https:' || callback.origin!==origin.origin || callback.username || callback.password
    || callback.search || callback.hash || callback.pathname!=='/api/v1/integrations/facebook-management/oauth/callback')throw invalid();
  return {enabled:true,appId,graphVersion,loginConfigId,callbackUrl};
}
