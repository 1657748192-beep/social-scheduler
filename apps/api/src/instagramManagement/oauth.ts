import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {PrismaClient} from '@prisma/client';
import type {Scope} from '../interactionInbox/types';
import type {LiveInboxPolicy} from '../interactionInbox/livePolicy';
import {HttpError} from '../utils/errors';
import {requireInstagramAccount,type createInstagramManagementStore} from './store';
import type {InstagramManagementConfig,InstagramManagementGrant} from './types';
const grantSchema=z.object({appId:z.string().regex(/^\d{1,256}$/),providerAccountId:z.string().regex(/^\d{1,256}$/),providerUserId:z.string().regex(/^\d{1,256}$/),accessToken:z.string().min(1).max(16384),scopes:z.array(z.string().min(1).max(128)).max(50),expiresAt:z.date(),displayName:z.string().max(180).optional()}).strict();
export function createInstagramManagementOAuth({db,config,policy,store,exchange}:{db:PrismaClient;config:InstagramManagementConfig;policy:LiveInboxPolicy;store:ReturnType<typeof createInstagramManagementStore>;exchange:(code:string,callbackUrl:string)=>Promise<InstagramManagementGrant>}){
 const fail=()=>new HttpError(400,'Independent Instagram authorization failed');
 return{
  async start(ctx:Scope,accountId:string){
   if(!config.enabled)throw new HttpError(409,'Independent Instagram authorization is disabled');
   z.string().uuid().parse(accountId);
   const state=randomBytes(32).toString('base64url');await store.createState(ctx,accountId,config.appId,state,config.callbackUrl);
   const url=new URL('https://www.instagram.com/oauth/authorize');url.search=new URLSearchParams({client_id:config.appId,redirect_uri:config.callbackUrl,response_type:'code',scope:config.requiredScopes.join(','),state,force_reauth:'true'}).toString();
   return{authorizationUrl:url.href};
  },
  async callback(input:{state:string;code?:string;error?:string}){
   if(!config.enabled||typeof input.state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(input.state))throw fail();
   let phase='state_claim';
   try{
    const saved=await store.consumeState(input.state);
    if(!saved)throw fail();
    phase='provider_response';
    if(input.error||!input.code||input.code.length>8192||saved.appId!==config.appId||saved.callbackUrl!==config.callbackUrl)throw fail();
    phase='session_or_account';
    const ctx:Scope={workspaceId:saved.workspaceId,userId:saved.userId,sessionId:saved.sessionId},account=await requireInstagramAccount(db,ctx,saved.accountId,'manage');
    if(account.providerAccountId!==saved.expectedProviderAccountId)throw fail();
    phase='policy';policy.requireAsset({workspaceId:ctx.workspaceId,platform:'instagram',appId:config.appId,providerAssetId:account.providerAccountId},'read');
    phase='exchange';
    const grant=grantSchema.parse(await exchange(input.code,config.callbackUrl));
    phase='grant_validation';
    if(grant.appId!==config.appId||grant.providerAccountId!==account.providerAccountId||grant.expiresAt<=new Date()||config.requiredScopes.some(scope=>!grant.scopes.includes(scope)))throw fail();
    phase='save_grant';return{connectionId:await store.saveGrant(saved,grant)};
   }catch{console.warn('IG_MANAGEMENT_CALLBACK_FAILURE',phase);throw fail();}
  }
 };
}
