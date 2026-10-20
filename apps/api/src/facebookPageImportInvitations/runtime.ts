import {prisma} from '../prisma';import {redis} from '../redis';import {config} from '../config';
import {encryptToken,decryptToken} from '../utils/tokenCrypto';
import {getOAuthProvider,redirectUriFor} from '../integrations/oauth/oauthProviders';
import {createFacebookPageSyncGraph} from '../facebookPageSync/graph';
import {createInvitationRepository} from './repository';import {createInvitationFlows} from './flows';import {createInvitationOAuth} from './oauth';
import {createFacebookPageImportInvitationService} from './service';import {createInvitationMaintenance} from './maintenance';
export function createPageImportRuntime(){
 const provider=getOAuthProvider('facebook'),db=prisma,encrypt=encryptToken,decrypt=decryptToken,appId=provider.clientId;
 const graph=createFacebookPageSyncGraph({provider,appSecret:config.FACEBOOK_CLIENT_SECRET,callbackUrl:redirectUriFor('facebook'),loginConfigId:config.FACEBOOK_LOGIN_CONFIG_ID});
 const repo=createInvitationRepository({db,encrypt,decrypt,appId}),flows=createInvitationFlows(redis);
 return{service:createFacebookPageImportInvitationService({db,encrypt,appId,repo,graph}),oauth:createInvitationOAuth({db,appId,repo,flows,graph}),flows,maintain:createInvitationMaintenance(db)};
}
export type PageImportRuntime=ReturnType<typeof createPageImportRuntime>;
let runtime:PageImportRuntime|undefined;
export const getPageImportRuntime=()=>runtime??=createPageImportRuntime();
