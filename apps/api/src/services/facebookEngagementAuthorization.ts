import { config } from '../config';
import { prisma } from '../prisma';
import { encryptToken } from '../utils/tokenCrypto';
import { getOAuthProvider } from '../integrations/oauth/oauthProviders';
import { exchangeFacebookEngagementGrant } from '../integrations/oauth/facebookEngagementGateway';
import { createFacebookEngagementAuthorizationService } from './facebookEngagementOAuth';
import { createFacebookOAuthStore } from './facebookOAuthStore';
import { requireWorkspaceManager } from './workspaceService';

export function facebookEngagementAuthorizationService() {
  const provider=getOAuthProvider('facebook');
  return createFacebookEngagementAuthorizationService({store:createFacebookOAuthStore(prisma,encryptToken),enabled:()=>config.FACEBOOK_ENGAGEMENT_ENABLED,
    requireManager:requireWorkspaceManager,authorization:{url:provider.authorizationUrl,clientId:provider.clientId,
      redirectUri:`${config.API_PUBLIC_URL}/api/v1/integrations/facebook-engagement/oauth/callback`,defaultScopes:provider.defaultScopes,loginConfigId:config.FACEBOOK_ENGAGEMENT_LOGIN_CONFIG_ID},
    exchange:(code,redirectUri,pageId)=>exchangeFacebookEngagementGrant({code,redirectUri,pageId,appId:config.FACEBOOK_CLIENT_ID,appSecret:config.FACEBOOK_CLIENT_SECRET,apiVersion:config.FACEBOOK_GRAPH_API_VERSION}),now:()=>new Date()});
}
export async function startFacebookEngagementAuthorization(userId:string,workspaceId:string,socialAccountId:string) {
  return facebookEngagementAuthorizationService().start(userId,workspaceId,socialAccountId);
}
