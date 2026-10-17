import type {OAuthProviderConfig} from '../integrations/oauth/oauthProviders';
import {HttpError} from '../utils/errors';
import type {PageCandidate,VerifiedPage} from './types';

const required=['pages_manage_posts','pages_read_engagement'];
const numeric=/^\d{1,256}$/;
export function createFacebookPageSyncGraph(input:{provider:OAuthProviderConfig;appSecret:string;callbackUrl:string;loginConfigId?:string;fetchImpl?:typeof fetch}){
 const {provider,appSecret,callbackUrl}=input,fetcher=input.fetchImpl??fetch;
 const version=new URL(provider.tokenUrl).pathname.split('/')[1];
 if(provider.platform!=='facebook'||new URL(provider.tokenUrl).hostname!=='graph.facebook.com'||!/^v\d+\.\d+$/.test(version))throw new HttpError(503,'Facebook sync is not configured');
 const endpoint=(path:string)=>new URL(`https://graph.facebook.com/${version}/${path}`);
 const fail=(code='provider_unavailable',status=502)=>new HttpError(status,'Facebook Page sync unavailable',{code});
 function budget(){return{deadline:Date.now()+60000,bytes:0};}
 async function request(url:URL,options:RequestInit,b:ReturnType<typeof budget>){
  if(Date.now()>=b.deadline)throw fail('provider_timeout');
  try{
   const response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,b.deadline-Date.now())))});
   if(!response.ok){await response.body?.cancel();throw fail(response.status===429?'rate_limited':'provider_unavailable');}
   const reader=response.body?.getReader();if(!reader)throw fail();
   const chunks:Uint8Array[]=[];
   try{while(true){const {done,value}=await reader.read();if(done)break;b.bytes+=value.byteLength;if(b.bytes>4*1024*1024)throw fail('directory_too_large');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
   return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch(error){if(error instanceof HttpError)throw error;throw fail();}
 }
 async function inspect(token:string,type:'USER'|'PAGE',pageId:string|undefined,b:ReturnType<typeof budget>){
  const url=endpoint('debug_token');url.searchParams.set('input_token',token);url.searchParams.set('access_token',provider.clientId+'|'+appSecret);
  const data=(await request(url,{},b))?.data;
  if(!data||data.is_valid!==true||data.app_id!==provider.clientId||data.type!==type||!Array.isArray(data.scopes)||!data.scopes.every((s:unknown)=>typeof s==='string')||!Number.isFinite(data.expires_at)||data.expires_at<0||data.expires_at>8.64e12||data.expires_at>0&&data.expires_at*1000<=Date.now())throw fail('authorization_invalid',400);
  const scopes=data.scopes as string[];
  if(!(type==='USER'?['pages_show_list',...required]:required).every(scope=>scopes.includes(scope)))throw fail('permission_missing',400);
  if(data.granular_scopes!==undefined){if(!Array.isArray(data.granular_scopes))throw fail('authorization_invalid',400);for(const g of data.granular_scopes){if(pageId&&required.includes(g.scope)&&g.target_ids!==undefined&&(!Array.isArray(g.target_ids)||!g.target_ids.includes(pageId)))throw fail('permission_missing',400);}}
  return{scopes,expiresAt:data.expires_at>0?new Date(data.expires_at*1000):null,userId:data.user_id};
 }
 async function validate(page:VerifiedPage,b:ReturnType<typeof budget>){
  const grant=await inspect(page.pageToken,'PAGE',page.pageId,b),url=endpoint(page.pageId);url.searchParams.set('fields','id');
  const identity=await request(url,{headers:{Authorization:'Bearer '+page.pageToken}},b);
  if(identity?.id!==page.pageId)throw fail('authorization_invalid',400);
  return{...page,scopes:grant.scopes,expiresAt:grant.expiresAt};
 }
 async function revalidate(pages:VerifiedPage[]){
  const b=budget(),result:VerifiedPage[]=new Array(pages.length);let index=0;
  await Promise.all(Array.from({length:Math.min(4,pages.length)},async()=>{while(index<pages.length){const i=index++;result[i]=await validate(pages[i],b);}}));return result;
 }
 return{
  authorizationUrl(state:string){
   const url=new URL(provider.authorizationUrl);if(url.hostname!=='www.facebook.com'||!provider.clientId||!appSecret)throw fail('not_configured',503);
   url.search=new URLSearchParams({...provider.authorizationParams,response_type:'code',client_id:provider.clientId,redirect_uri:callbackUrl,state,...(input.loginConfigId?{config_id:input.loginConfigId,override_default_response_type:'true'}:{scope:provider.defaultScopes.join(',')})}).toString();return url.href;
  },
  async discover(code:string){
   if(!code||code.length>8192)throw fail('authorization_invalid',400);
   const b=budget(),body=new URLSearchParams({grant_type:'authorization_code',client_id:provider.clientId,client_secret:appSecret,redirect_uri:callbackUrl,code});
   let token=(await request(endpoint('oauth/access_token'),{method:'POST',body},b))?.access_token;
   if(typeof token!=='string'||!token||token.length>16384)throw fail('authorization_invalid',400);
   const long=endpoint('oauth/access_token');long.search=new URLSearchParams({grant_type:'fb_exchange_token',client_id:provider.clientId,client_secret:appSecret,fb_exchange_token:token}).toString();
   token=(await request(long,{},b))?.access_token;if(typeof token!=='string'||!token||token.length>16384)throw fail('authorization_invalid',400);
   const userGrant=await inspect(token,'USER',undefined,b),identity=await request(endpoint('me'),{headers:{Authorization:'Bearer '+token}},b);
   if(!numeric.test(identity?.id)||identity.id!==userGrant.userId)throw fail('authorization_invalid',400);
   const raw=new Map<string,VerifiedPage>(),rejected:PageCandidate[]=[],seenCursors=new Set<string>();let cursor='';let total=0;
   while(true){
    const url=endpoint('me/accounts');url.search=new URLSearchParams({fields:'id,name,access_token,picture{url}',limit:'100',...(cursor?{after:cursor}:{})}).toString();
    const payload=await request(url,{headers:{Authorization:'Bearer '+token}},b);if(!Array.isArray(payload?.data))throw fail();
    total+=payload.data.length;if(total>2000)throw fail('directory_too_large',400);
    for(const row of payload.data){
     if(!numeric.test(row?.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>200)throw fail('invalid_page_metadata',400);
     let avatarUrl:string|null=null;if(row.picture?.data?.url){try{const avatar=new URL(row.picture.data.url);if(avatar.protocol!=='https:'||avatar.username||avatar.password||avatar.href.length>4096)throw Error();avatarUrl=avatar.href;}catch{throw fail('invalid_page_metadata',400);}}
     const base={pageId:row.id,name:row.name,avatarUrl,profileUrl:`https://www.facebook.com/${row.id}`};
     if(typeof row.access_token!=='string'||!row.access_token||row.access_token.length>16384){if(!raw.has(row.id)&&!rejected.some(p=>p.pageId===row.id))rejected.push({...base,existing:false,eligible:false,reason:'permission_missing'});continue;}
     const previous=raw.get(row.id);if(previous&&previous.pageToken!==row.access_token)throw fail('inconsistent_directory',400);
     raw.set(row.id,{...base,pageToken:row.access_token,scopes:[],expiresAt:null});
    }
    if(!payload.paging?.next)break;
    const next=payload.paging?.cursors?.after;if(typeof next!=='string'||!next||next.length>2048||/[\x00-\x20\x7f]/.test(next)||seenCursors.has(next))throw fail('invalid_pagination',400);seenCursors.add(next);cursor=next;
   }
   const pages:VerifiedPage[]=[];let index=0;const list=[...raw.values()];
   await Promise.all(Array.from({length:Math.min(4,list.length)},async()=>{while(index<list.length){const page=list[index++];try{pages.push(await validate(page,b));}catch(e){if(!(e instanceof HttpError)||e.statusCode!==400)throw e;rejected.push({pageId:page.pageId,name:page.name,avatarUrl:page.avatarUrl,profileUrl:page.profileUrl,existing:false,eligible:false,reason:(e.details as any)?.code==='permission_missing'?'permission_missing':'authorization_invalid'});}}}));
   return{providerUserId:identity.id as string,pages:pages.sort((a,b)=>a.pageId.localeCompare(b.pageId)),rejected:rejected.filter(p=>!raw.has(p.pageId)||!pages.some(v=>v.pageId===p.pageId))};
  },revalidate
 };
}
