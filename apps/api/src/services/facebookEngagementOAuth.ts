import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from '../utils/errors';

export type FacebookOAuthAccount = {id:string;providerAccountId:string;scopes:string[];accessTokenEncrypted:string};
export type FacebookEngagementOAuthState = {state:string;userId:string;workspaceId:string;socialAccountId:string;pageId:string;scopes:string[];expectedTokenHash:string;redirectUri:string;expiresAt:Date};
export type FacebookOAuthGrant = {pageId:string;pageToken:string;scopes:string[];expiresAt:Date|null};
export type FacebookOAuthStore = {
  account(workspaceId:string,socialAccountId:string):Promise<FacebookOAuthAccount|null>;
  create(state:FacebookEngagementOAuthState):Promise<void>;
  consume(state:string):Promise<FacebookEngagementOAuthState|null>;
  save(input:FacebookEngagementOAuthState & {grant:FacebookOAuthGrant}):Promise<boolean>;
};
export const facebookTokenFingerprint=(encrypted:string)=>createHash('sha256').update(encrypted).digest('hex');
export function createFacebookEngagementAuthorizationService(deps:{
  store:FacebookOAuthStore;enabled():boolean;requireManager(userId:string,workspaceId:string):Promise<unknown>;
  authorization:{url:string;clientId:string;redirectUri:string;defaultScopes:string[];loginConfigId:string};
  exchange(code:string,redirectUri:string,pageId:string):Promise<FacebookOAuthGrant>;now():Date;
}) {
  const requireEnabled=()=>{if(!deps.enabled())throw new HttpError(404,'Facebook engagement is not enabled.');};
  return {
    async start(userId:string,workspaceId:string,socialAccountId:string):Promise<{authorizationUrl:string}> {
      requireEnabled();await deps.requireManager(userId,workspaceId);
      const account=await deps.store.account(workspaceId,socialAccountId);
      if(!account)throw new HttpError(404,'Connected Facebook Page not found.');
      const scopes=[...new Set([...account.scopes,...deps.authorization.defaultScopes,'pages_show_list','pages_read_engagement','pages_read_user_content','pages_manage_engagement','pages_messaging','pages_manage_metadata'])];
      const state=randomBytes(32).toString('base64url');
      await deps.store.create({state,userId,workspaceId,socialAccountId,pageId:account.providerAccountId,scopes,expectedTokenHash:facebookTokenFingerprint(account.accessTokenEncrypted),redirectUri:deps.authorization.redirectUri,expiresAt:new Date(deps.now().getTime()+600000)});
      const url=new URL(deps.authorization.url);
      url.searchParams.set('client_id',deps.authorization.clientId);url.searchParams.set('redirect_uri',deps.authorization.redirectUri);
      url.searchParams.set('state',state);url.searchParams.set('response_type','code');
      if(deps.authorization.loginConfigId){url.searchParams.set('config_id',deps.authorization.loginConfigId);url.searchParams.set('override_default_response_type','true');}
      else url.searchParams.set('scope',scopes.join(','));
      return {authorizationUrl:url.toString()};
    },
    async complete(state:string,code?:string,error?:string):Promise<{socialAccountId:string;workspaceId:string}> {
      // Consume before provider calls: callback replay, including failures, cannot exchange twice.
      const saved=await deps.store.consume(state);
      if(!saved)throw new HttpError(400,'Invalid or consumed Facebook authorization state.');
      requireEnabled();
      if(error || !code || saved.expiresAt.getTime()<=deps.now().getTime())throw new HttpError(400,'Facebook authorization was cancelled or expired; existing connection unchanged.');
      await deps.requireManager(saved.userId,saved.workspaceId);
      const account=await deps.store.account(saved.workspaceId,saved.socialAccountId);
      if(!account || account.providerAccountId!==saved.pageId)throw new HttpError(400,'Connected Page is no longer available.');
      if(facebookTokenFingerprint(account.accessTokenEncrypted)!==saved.expectedTokenHash)throw new HttpError(409,'Page authorization changed; restart supplemental authorization.');
      const grant=await deps.exchange(code,saved.redirectUri,saved.pageId);
      if(grant.pageId!==saved.pageId || !grant.pageToken || !Array.isArray(grant.scopes) || !account.scopes.every(scope=>grant.scopes.includes(scope)))throw new HttpError(400,'The selected Page or original permissions were not retained; existing connection unchanged.');
      await deps.requireManager(saved.userId,saved.workspaceId);
      if(!await deps.store.save({...saved,grant}))throw new HttpError(409,'Page authorization changed; existing connection unchanged.');
      return {socialAccountId:saved.socialAccountId,workspaceId:saved.workspaceId};
    }
  };
}
