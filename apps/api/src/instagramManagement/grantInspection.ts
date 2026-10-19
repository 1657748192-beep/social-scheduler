import {z} from 'zod';
import {HttpError} from '../utils/errors';
import {readBoundedInstagramJson} from './http';
import type {InstagramManagementConfig,InstagramGrantInspector} from './types';

const id=z.string().regex(/^\d{1,256}$/);
const ids=z.object({data:z.array(z.object({id})).max(1)});
const conversationIds=z.object({data:z.array(z.object({id:z.string().regex(/^[-a-zA-Z0-9_:.]{1,256}$/).refine(v=>v!=='.'&&v!=='..')})).max(1)});
/**
 * Instagram Login supplies app/scopes/expiry at our server-side OAuth exchange.
 * It does not supply Facebook's current token-debugger contract. Bind that
 * provenance to the exact stored grant, then verify the requested capability
 * using a fresh, bounded, read-only provider request. Returned scopes name only
 * the capability actually probed, not a claimed live list of all permissions.
 */
export function createInstagramGrantInspector({config,fetchImpl=fetch,now=()=>new Date()}:{config:InstagramManagementConfig;fetchImpl?:typeof fetch;now?:()=>Date}):InstagramGrantInspector{
 return async(accountId,token,context)=>{
  try{
   const c=context?.connection,cap=context?.capability;
   if(!config.enabled||!context||!c||c.appId!==config.appId||c.providerAccountId!==accountId||!id.safeParse(accountId).success||!id.safeParse(c.providerUserId).success||!Number.isSafeInteger(c.version)||c.version<1||!token||token.length>16384||!c.expiresAt||!Number.isFinite(c.expiresAt.getTime())||c.expiresAt<=now())throw Error();
   if(!c.authorizedAt||!c.authorizationStartedAt||!Number.isFinite(c.authorizedAt.getTime())||!Number.isFinite(c.authorizationStartedAt.getTime())||c.authorizationStartedAt.getTime()<=0||c.authorizationStartedAt>c.authorizedAt||c.authorizedAt>now()||c.expiresAt<=c.authorizedAt)throw Error();
   if(!['comments.read','comments.reply','messages.read','messages.reply'].includes(cap!))throw Error();
   const required=['instagram_business_basic',cap!.startsWith('comments.')?'instagram_business_manage_comments':'instagram_business_manage_messages'];
   if(required.some(s=>!c.scopes.includes(s)))throw Error();
   async function get(path:string,query:Record<string,string>){
    const url=new URL(`https://graph.instagram.com/${config.graphVersion}/${path}`);
    for(const[k,v]of Object.entries(query))url.searchParams.set(k,v);
    const raw=await readBoundedInstagramJson(fetchImpl,url,{method:'GET',headers:{Authorization:'Bearer '+token}});
    return z.object({error:z.never().optional()}).passthrough().parse(raw);
   }
   const profile=z.object({id,user_id:id.optional(),account_type:z.enum(['BUSINESS','MEDIA_CREATOR','CREATOR'])}).parse(await get('me',{fields:'id,user_id,account_type'}));
   if((profile.user_id??profile.id)!==accountId||![profile.id,profile.user_id].includes(c.providerUserId))throw Error();
   if(cap!.startsWith('comments.')){
    const media=ids.parse(await get(`${accountId}/media`,{fields:'id',limit:'1'}));
    // No owned media means we cannot prove comments permission; do not mark it
    // granted merely because the basic profile/media request succeeded.
    if(!media.data.length)throw Error();
    ids.parse(await get(`${media.data[0].id}/comments`,{fields:'id',limit:'1'}));
   }else conversationIds.parse(await get(`${accountId}/conversations`,{fields:'id',limit:'1',platform:'instagram'}));
   if(c.expiresAt<=now())throw Error();
   return{appId:c.appId,providerAccountId:accountId,scopes:required,expiresAt:c.expiresAt};
  }catch{throw new HttpError(409,'Independent Instagram verification unavailable');}
 };
}
