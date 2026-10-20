import {prisma} from '../prisma';import {redis} from '../redis';import {config} from '../config';
import {encryptToken,decryptToken} from '../utils/tokenCrypto';
import {getOAuthProvider,redirectUriFor} from '../integrations/oauth/oauthProviders';
import {createFacebookPageSyncGraph} from '../facebookPageSync/graph';
import {createInvitationRepository} from './repository';import {createInvitationFlows} from './flows';import {createInvitationOAuth} from './oauth';
import {createFacebookPageImportInvitationService} from './service';import {createInvitationMaintenance} from './maintenance';
import {HttpError} from '../utils/errors';
export function createPageImportRuntime(){
 const loginConfigId=config.FACEBOOK_PAGE_IMPORT_LOGIN_CONFIG_ID;
 if(!/^\d{1,256}$/.test(loginConfigId))throw new HttpError(503,'Facebook Page import is not configured');
 const provider=getOAuthProvider('facebook'),db=prisma,encrypt=encryptToken,decrypt=decryptToken,appId=provider.clientId;
 const graph=createFacebookPageSyncGraph({provider,appSecret:config.FACEBOOK_CLIENT_SECRET,callbackUrl:redirectUriFor('facebook'),loginConfigId});
 const repo=createInvitationRepository({db,encrypt,decrypt,appId}),flows=createInvitationFlows(redis);
 return{service:createFacebookPageImportInvitationService({db,encrypt,appId,repo,graph}),oauth:createInvitationOAuth({db,appId,repo,flows,graph}),flows,maintain:createInvitationMaintenance(db)};
}
export type PageImportRuntime=ReturnType<typeof createPageImportRuntime>;
let runtime:PageImportRuntime|undefined;
export const getPageImportRuntime=()=>runtime??=createPageImportRuntime();
