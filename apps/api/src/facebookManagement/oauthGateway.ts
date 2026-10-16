import type {FacebookManagementConfig} from './config';
import {createFacebookDirectoryClient,readAllDirectoryPages,FacebookDirectoryError} from './graphDirectory';
import {ManagementAuthorizationError,type ManagementGrant} from './store';
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new ManagementAuthorizationError();return value as Record<string,unknown>;}
function identity(value:unknown){const id=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;if(typeof id!=='string'||!/^\d{1,256}$/.test(id))throw new ManagementAuthorizationError();return id;}
function expiration(value:unknown):Date|null{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new ManagementAuthorizationError();if(value===0)return null;const date=new Date(value*1000);if(!Number.isFinite(date.getTime())||date<=new Date())throw new ManagementAuthorizationError();return date;}
export function createFacebookManagementGateway(input:{config:FacebookManagementConfig;appSecret:string;fetchImpl?:typeof fetch}){
  const {config,appSecret}=input,fetcher=input.fetchImpl??fetch;
  async function request(path:string,params:Record<string,string>,token?:string){
    const url=new URL(`https://graph.facebook.com/${config.graphVersion}/${path}`);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    try{
      const response=await fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:token?{Authorization:`Bearer ${token}`}:{}});
      const body=record(await response.json());if(!response.ok||body.error)throw new ManagementAuthorizationError();return body;
    }catch{throw new ManagementAuthorizationError();}
  }
  return {async exchange(code:string,callbackUrl:string):Promise<ManagementGrant>{
    if(!config.enabled||!appSecret||!code||code.length>8192||callbackUrl!==config.callbackUrl)throw new ManagementAuthorizationError();
    const token=await request('oauth/access_token',{client_id:config.appId,client_secret:appSecret,redirect_uri:callbackUrl,code});
    if(typeof token.access_token!=='string'||!token.access_token)throw new ManagementAuthorizationError();
    const userToken=token.access_token;
    const data=record((await request('debug_token',{input_token:userToken},`${config.appId}|${appSecret}`)).data);
    if(data.is_valid!==true||identity(data.app_id)!==config.appId||!Array.isArray(data.scopes)||data.scopes.some(s=>typeof s!=='string'||!s||s.length>256))throw new ManagementAuthorizationError();
    const providerUserId=identity(data.user_id),scopes=[...new Set(data.scopes)] as string[];
    let expiresAt=expiration(data.expires_at);
    if(data.data_access_expires_at!==undefined){const accessExpiry=expiration(data.data_access_expires_at);if(accessExpiry&&(!expiresAt||accessExpiry<expiresAt))expiresAt=accessExpiry;}
    if(identity((await request('me',{fields:'id'},userToken)).id)!==providerUserId)throw new ManagementAuthorizationError();
    const directory=createFacebookDirectoryClient({userToken,apiVersion:config.graphVersion,appId:config.appId,appSecret,fetchImpl:fetcher});
    const pages:ManagementGrant['pages']=[];
    for(const page of await readAllDirectoryPages(after=>directory.listUserPages(after))){
      let pageToken=page.pageToken,pageScopes:string[]=[],pageExpiresAt:Date|null=null;
      if(pageToken){try{
        const inspection=await directory.inspectPageToken(page.id,pageToken);
        pageScopes=inspection.scopes.filter(s=>!inspection.granularScopes.some(g=>g.scope===s&&g.targetIds!==null&&!g.targetIds.includes(page.id)));
        pageExpiresAt=inspection.expiresAt?new Date(inspection.expiresAt):null;
        if(pageExpiresAt&&pageExpiresAt<=new Date())pageToken=null;
      }catch(error){if(error instanceof FacebookDirectoryError&&['authorization_invalid','permission_missing'].includes(error.kind))pageToken=null;else throw new ManagementAuthorizationError();}}
      pages.push({pageId:page.id,name:page.name,profileUrl:page.profileUrl,avatarUrl:page.avatarUrl,pageToken,tasks:page.tasks,scopes:pageScopes,expiresAt:pageExpiresAt});
    }
    return {appId:config.appId,providerUserId,userToken,scopes,expiresAt,pages};
  }};
}
