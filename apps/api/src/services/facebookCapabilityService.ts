import { config } from '../config';
import { prisma } from '../prisma';
import { decryptToken } from '../utils/tokenCrypto';
import { HttpError } from '../utils/errors';
import { createFacebookEngagementClient } from '../integrations/social/facebookEngagement';

export async function inspectFacebookAccountCapabilities(accountId:string) {
  if(!config.FACEBOOK_ENGAGEMENT_ENABLED)throw new HttpError(404,'Facebook engagement is not enabled.');
  const account=await prisma.socialAccount.findFirst({where:{id:accountId,platform:'facebook',accountType:'page',status:'active'},include:{credential:true}});
  if(!account?.credential)throw new HttpError(404,'Connected Facebook Page not found.');
  // Interaction failures must not change publishing status or stored credentials.
  return createFacebookEngagementClient({pageId:account.providerAccountId,accessToken:decryptToken(account.credential.accessTokenEncrypted),
    apiVersion:config.FACEBOOK_GRAPH_API_VERSION,appId:config.FACEBOOK_CLIENT_ID,appSecret:config.FACEBOOK_CLIENT_SECRET}).inspectCapabilities();
}
