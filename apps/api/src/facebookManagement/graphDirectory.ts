import {randomUUID} from 'node:crypto';
import type {DirectoryBusiness,DirectoryPage,DirectorySlice,DirectoryUserPage,PageTokenInspection} from './types';
import {metaRetryAfter} from '../utils/metaRetryAfter';

type Failure = 'invalid_input'|'invalid_response'|'authorization_invalid'|'permission_missing'|'rate_limited'|'temporary_failure';
export class FacebookDirectoryError extends Error {
  readonly diagnosticId=randomUUID();
  constructor(readonly kind:Failure,readonly retryAfterSeconds?:number){super(`Facebook directory ${kind}`);this.name='FacebookDirectoryError';}
}
const fail=(kind:Failure):never=>{throw new FacebookDirectoryError(kind);};
function record(value:unknown):Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value))return fail('invalid_response');
  return value as Record<string,unknown>;
}
function identifier(value:unknown,kind:Failure='invalid_input'):string {
  if(typeof value!=='string' || !/^\d{1,256}$/.test(value))return fail(kind);
  return value;
}
function cursor(value:unknown):string {
  if(typeof value!=='string' || !value || value.length>2048 || /[\x00-\x20\x7f]/.test(value))return fail('invalid_input');
  return value;
}
function strings(value:unknown):string[] {
  if(!Array.isArray(value) || value.some(s=>typeof s!=='string' || !s || s.length>256))return fail('invalid_response');
  return [...new Set(value)] as string[];
}
function safeUrl(value:unknown,avatar=false):string|null {
  if(typeof value!=='string' || value.length>4096)return null;
  try {
    const u=new URL(value);
    const allowed=u.hostname==='facebook.com' || u.hostname.endsWith('.facebook.com') || (avatar && (u.hostname==='fbcdn.net' || u.hostname.endsWith('.fbcdn.net')));
    return u.protocol==='https:' && !u.username && !u.password && allowed?u.href:null;
  }catch{return null;}
}
function basic(raw:Record<string,unknown>):DirectoryBusiness {
  if(typeof raw.name!=='string' || !raw.name.trim() || raw.name.length>512)return fail('invalid_response');
  return {id:identifier(raw.id,'invalid_response'),name:raw.name};
}
function page(raw:Record<string,unknown>):DirectoryPage {
  const image=raw.picture && typeof raw.picture==='object'?(raw.picture as {data?:{url?:unknown}}).data?.url:undefined;
  return {...basic(raw),profileUrl:safeUrl(raw.link),avatarUrl:safeUrl(image,true)};
}

export function createFacebookDirectoryClient(input:{userToken:string;apiVersion:string;appId:string;appSecret:string;fetchImpl?:typeof fetch}) {
  identifier(input.appId);
  if(!input.userToken || !input.appSecret || !/^v[1-9]\d?\.0$/.test(input.apiVersion))fail('invalid_input');
  const fetcher=input.fetchImpl??fetch;
  let active=0;const waiting:Array<()=>void>=[];
  async function acquire(){if(active<2){active++;return;}await new Promise<void>(resolve=>waiting.push(resolve));}
  function release(){const next=waiting.shift();if(next)next();else active--;}
  async function request(path:string,params:Record<string,string>,token=input.userToken):Promise<Record<string,unknown>> {
    const url=new URL(`https://graph.facebook.com/${input.apiVersion}/${path}`);
    for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    await acquire();
    try {
      let res:Response;
      try {res=await fetcher(url,{method:'GET',headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(10000)});}
      catch{return fail('temporary_failure');}
      let parsed:unknown;
      try {parsed=await res.json();}catch{return fail('invalid_response');}
      const data=record(parsed);
      if(!res.ok || data.error){
        const error=data.error && typeof data.error==='object'?data.error as {code?:unknown}:{};
        if(error.code===190)return fail('authorization_invalid');
        if(res.status===429 || [4,17,32,613].includes(Number(error.code)))throw new FacebookDirectoryError('rate_limited',metaRetryAfter(res.headers.get('retry-after')));
        if(error.code===10 || Number(error.code)===200)return fail('permission_missing');
        return fail(res.status>=500?'temporary_failure':'invalid_response');
      }
      return data;
    }finally{release();}
  }
  async function list<T>(path:string,fields:string,map:(raw:Record<string,unknown>)=>T,after?:string):Promise<DirectorySlice<T>> {
    const value=await request(path,{fields,limit:'25',...(after===undefined?{}:{after:cursor(after)})});
    if(!Array.isArray(value.data) || value.data.length>25)return fail('invalid_response');
    let nextCursor:string|null=null;
    if(value.paging!==undefined){
      const paging=record(value.paging);
      if(paging.next!==undefined){
        let next:URL;
        try{next=new URL(String(paging.next));}catch{return fail('invalid_response');}
        if(next.origin!=='https://graph.facebook.com' || next.username || next.password)return fail('invalid_response');
        try{nextCursor=cursor(record(paging.cursors).after);}catch{return fail('invalid_response');}
        if(nextCursor===after)return fail('invalid_response');
      }
    }
    return {items:value.data.map(raw=>map(record(raw))),nextCursor};
  }
  return {
    listBusinesses(after?:string):Promise<DirectorySlice<DirectoryBusiness>> {return list('me/businesses','id,name',basic,after);},
    async listBusinessPages(businessId:string,relation:'owned'|'client',after?:string):Promise<DirectorySlice<DirectoryPage>> {
      identifier(businessId);if(relation!=='owned' && relation!=='client')return fail('invalid_input');
      return list(`${businessId}/${relation}_pages`,'id,name,link,picture',page,after);
    },
    listUserPages(after?:string):Promise<DirectorySlice<DirectoryUserPage>> {
      return list('me/accounts','id,name,link,picture,access_token,tasks',raw=>({...page(raw),
        pageToken:typeof raw.access_token==='string' && raw.access_token?raw.access_token:null,
        tasks:raw.tasks===undefined?[]:strings(raw.tasks)}),after);
    },
    async inspectPageToken(pageId:string,token:string):Promise<PageTokenInspection> {
      identifier(pageId);if(!token)return fail('invalid_input');
      const data=record((await request('debug_token',{input_token:token},`${input.appId}|${input.appSecret}`)).data);
      const issuer=typeof data.app_id==='number'&&Number.isSafeInteger(data.app_id)?String(data.app_id):data.app_id;
      if(issuer!==input.appId || data.is_valid!==true || (data.profile_id!==undefined && data.profile_id!==pageId))return fail('authorization_invalid');
      const scopes=strings(data.scopes);
      const granularScopes:PageTokenInspection['granularScopes']=[];
      if(data.granular_scopes!==undefined){
        if(!Array.isArray(data.granular_scopes))return fail('invalid_response');
        for(const raw of data.granular_scopes){
          const grant=record(raw);
          if(typeof grant.scope!=='string' || !grant.scope)return fail('invalid_response');
          let targets:string[]|null=null;
          if(grant.target_ids!==undefined){
            if(!Array.isArray(grant.target_ids))return fail('invalid_response');
            targets=grant.target_ids.map(value=>identifier(typeof value==='number' && Number.isSafeInteger(value)?String(value):value,'invalid_response'));
          }
          granularScopes.push({scope:grant.scope,targetIds:targets});
        }
      }
      let expiresAt:string|null=null;
      if(data.expires_at!==undefined && data.expires_at!==0){
        if(typeof data.expires_at!=='number' || !Number.isSafeInteger(data.expires_at) || data.expires_at<0 || !Number.isFinite(new Date(data.expires_at*1000).getTime()))return fail('invalid_response');
        expiresAt=new Date(data.expires_at*1000).toISOString();
      }
      const identity=await request('me',{fields:'id'},token);
      if(identity.id!==pageId)return fail('authorization_invalid');
      return {pageId,scopes,granularScopes,expiresAt};
    },
  };
}

/** A full snapshot is returned only after every page succeeds; failures never look complete. */
export async function readAllDirectoryPages<T>(load:(after?:string)=>Promise<DirectorySlice<T>>):Promise<T[]> {
  const items:T[]=[];const seen=new Set<string>();let after:string|undefined;
  for(let count=0;count<100;count++){
    const result=await load(after);items.push(...result.items);
    if(!result.nextCursor)return items;
    if(seen.has(result.nextCursor))return fail('invalid_response');
    after=cursor(result.nextCursor);seen.add(after);
  }
  return fail('invalid_response');
}
