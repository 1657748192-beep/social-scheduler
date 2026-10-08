import { HttpError } from '../../utils/errors';
import type { FacebookOAuthGrant } from '../../services/facebookEngagementOAuth';
import { normalizeFacebookPageExpiry } from '../social/facebookPageValidation';

const record=(value:unknown):Record<string,unknown>=>typeof value==='object' && value!==null && !Array.isArray(value) ? value as Record<string,unknown> : {};
// Never log arbitrary exception messages, URLs, provider payloads, or OAuth secrets.
export function summarizeFacebookAuthorizationFailure(error:unknown):Record<string,string|number> {
  if(!(error instanceof HttpError))return {reason:'unknown'};
  const reasons:Record<string,string>={
    'Invalid or consumed Facebook authorization state.':'invalid_state',
    'Facebook authorization was cancelled or expired; existing connection unchanged.':'cancelled_or_expired',
    'Facebook engagement is not enabled.':'feature_disabled',
    'Connected Page is no longer available.':'page_unavailable',
    'Page authorization changed; restart supplemental authorization.':'credential_changed',
    'Page authorization changed; existing connection unchanged.':'credential_save_conflict',
    'The selected Page or original permissions were not retained; existing connection unchanged.':'original_permissions_not_retained',
    'Selected Page and its tasks were not returned; existing connection unchanged.':'page_not_returned',
    'Facebook did not verify the actual Page permissions; existing connection unchanged.':'page_grant_unverified',
    'Facebook Page identity does not match.':'page_identity_mismatch',
    'Facebook did not return an access token.':'token_not_returned',
    'Facebook did not return Page authorization details.':'page_details_missing',
    'Facebook authorization is not configured.':'not_configured'
  };
  const result:Record<string,string|number>={reason:reasons[error.message]??'unknown'};
  if(Number.isSafeInteger(error.statusCode) && error.statusCode>=400 && error.statusCode<=599)result.status=error.statusCode;
  const details=record(error.details);
  if(['oauth/access_token','me/accounts','debug_token','me'].includes(String(details.stage)) && ['provider_rejected','transport_failed'].includes(String(details.reason))){
    result.stage=String(details.stage);result.reason=String(details.reason);
    for(const key of ['providerCode','providerSubcode'])if(typeof details[key]==='number' && Number.isSafeInteger(details[key]) && (details[key] as number)>=0)result[key]=details[key] as number;
  }
  return result;
}
export async function exchangeFacebookEngagementGrant(input:{appId:string;appSecret:string;apiVersion:string;code:string;redirectUri:string;pageId:string;fetchImpl?:typeof fetch}):Promise<FacebookOAuthGrant> {
  if(!/^v\d+\.\d+$/.test(input.apiVersion) || !input.appId || !input.appSecret)throw new HttpError(503,'Facebook authorization is not configured.');
  const fetcher=input.fetchImpl??fetch;
  async function request(path:string,token:string,params:Record<string,string>={},body?:URLSearchParams){
    const url=new URL(`https://graph.facebook.com/${input.apiVersion}/${path}`);
    for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    let response:Response;
    try{response=await fetcher(url,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:body?.toString()});}
    catch{throw new HttpError(502,'Facebook authorization request failed; existing connection unchanged.',{stage:path,reason:'transport_failed'});}
    const payload=record(await response.json().catch(()=>null));
    if(!response.ok || payload.error){
      const failure=record(payload.error);
      const numeric=(value:unknown)=>typeof value==='number' && Number.isSafeInteger(value) && value>=0 ? value : undefined;
      throw new HttpError(502,'Facebook rejected the authorization request; existing connection unchanged.',{stage:path,reason:'provider_rejected',
        ...(numeric(failure.code)!==undefined?{providerCode:numeric(failure.code)}:{}),
        ...(numeric(failure.error_subcode)!==undefined?{providerSubcode:numeric(failure.error_subcode)}:{})});
    }
    return payload;
  }
  const user=await request('oauth/access_token',`${input.appId}|${input.appSecret}`,{},new URLSearchParams({client_id:input.appId,client_secret:input.appSecret,code:input.code,redirect_uri:input.redirectUri}));
  if(typeof user.access_token!=='string' || !user.access_token)throw new HttpError(502,'Facebook did not return an access token.');
  let selected:Record<string,unknown>|undefined,after:string|undefined;
  for(let count=0;count<20;count++){
    const pages=await request('me/accounts',user.access_token,{fields:'id,access_token,tasks',limit:'100',...(after?{after}:{})});
    if(!Array.isArray(pages.data))throw new HttpError(502,'Facebook did not return Page authorization details.');
    selected=pages.data.map(record).find(page=>page.id===input.pageId);
    if(selected)break;
    const paging=record(pages.paging),cursor=record(paging.cursors).after;
    if(!paging.next || typeof cursor!=='string' || cursor===after)break;
    after=cursor;
  }
  if(!selected || typeof selected.access_token!=='string' || !selected.access_token || !Array.isArray(selected.tasks) || !selected.tasks.length)throw new HttpError(400,'Selected Page and its tasks were not returned; existing connection unchanged.');
  const data=record((await request('debug_token',`${input.appId}|${input.appSecret}`,{input_token:selected.access_token})).data);
  if(data.is_valid!==true || data.app_id!==input.appId || data.type!=='PAGE' || (data.profile_id && data.profile_id!==input.pageId) || !Array.isArray(data.scopes) || !data.scopes.every(scope=>typeof scope==='string'))throw new HttpError(400,'Facebook did not verify the actual Page permissions; existing connection unchanged.');
  const granular=Array.isArray(data.granular_scopes)?data.granular_scopes.map(record):[];
  const scopes=(data.scopes as string[]).filter(scope=>!granular.some(grant=>grant.scope===scope && Array.isArray(grant.target_ids) && grant.target_ids.length && !grant.target_ids.includes(input.pageId)));
  const identity=await request('me',selected.access_token,{fields:'id'});
  if(identity.id!==input.pageId)throw new HttpError(400,'Facebook Page identity does not match.');
  return {pageId:input.pageId,pageToken:selected.access_token,scopes,expiresAt:normalizeFacebookPageExpiry(data.expires_at)};
}
