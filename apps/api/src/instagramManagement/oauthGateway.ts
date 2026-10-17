import {z} from 'zod';
import {HttpError} from '../utils/errors';
import {parseInstagramGrantedScopes} from '../integrations/oauth/instagramEngagementOAuth';
import {readBoundedInstagramJson} from './http';
import type {InstagramManagementConfig,InstagramManagementGrant} from './types';
const providerId=z.union([z.string().regex(/^\d{1,256}$/),z.number().int().positive().safe().transform(String)]);
const token=z.string().min(1).max(16384);
export function createInstagramManagementGateway({config,fetchImpl=fetch}:{config:InstagramManagementConfig;fetchImpl?:typeof fetch}){
 return{async exchange(code:string,callbackUrl:string):Promise<InstagramManagementGrant>{
  try{
   if(!config.enabled||callbackUrl!==config.callbackUrl||!code||code.length>8192)throw Error();
   const form=new URLSearchParams({grant_type:'authorization_code',client_id:config.appId,client_secret:config.appSecret,redirect_uri:callbackUrl,code});
   let raw=z.record(z.unknown()).parse(await readBoundedInstagramJson(fetchImpl,new URL('https://api.instagram.com/oauth/access_token'),{method:'POST',body:form,headers:{'Content-Type':'application/x-www-form-urlencoded'}}));
   if(raw.data!==undefined){if(raw.access_token!==undefined||!Array.isArray(raw.data)||raw.data.length!==1)throw Error();raw=z.record(z.unknown()).parse(raw.data[0]);}
   const short=token.parse(raw.access_token),owner=providerId.parse(raw.user_id),scopes=parseInstagramGrantedScopes(raw);
   if(!scopes||config.requiredScopes.some(scope=>!scopes.includes(scope)))throw Error();
   const longUrl=new URL('https://graph.instagram.com/access_token');longUrl.search=new URLSearchParams({grant_type:'ig_exchange_token',client_secret:config.appSecret,access_token:short}).toString();
   const long=z.object({access_token:token,expires_in:z.number().int().positive().max(31536000)}).parse(await readBoundedInstagramJson(fetchImpl,longUrl));
   const profileUrl=new URL(`https://graph.instagram.com/${config.graphVersion}/me`);profileUrl.searchParams.set('fields','id,user_id,username,account_type');
   const profile=z.object({id:providerId,user_id:providerId.optional(),username:z.string().max(180).optional(),account_type:z.enum(['BUSINESS','MEDIA_CREATOR','CREATOR'])}).parse(await readBoundedInstagramJson(fetchImpl,profileUrl,{headers:{Authorization:'Bearer '+long.access_token}}));
   if(![profile.id,profile.user_id].includes(owner))throw Error();
   return{appId:config.appId,providerAccountId:profile.user_id??profile.id,providerUserId:owner,accessToken:long.access_token,scopes,expiresAt:new Date(Date.now()+long.expires_in*1000),displayName:profile.username};
  }catch{throw new HttpError(502,'Independent Instagram authorization exchange unavailable');}
 }};
}
