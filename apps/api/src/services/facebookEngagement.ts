import { config } from '../config';
import { prisma } from '../prisma';
import { decryptToken } from '../utils/tokenCrypto';
import { createFacebookEngagementClient } from '../integrations/social/facebookEngagement';
import { requireWorkspaceMembership } from './workspaceService';
import { createFacebookEngagementService } from './facebookEngagementService';
import { facebookReceptionStore } from './facebookReception';

export const facebookEngagementService=createFacebookEngagementService({enabled:()=>config.FACEBOOK_ENGAGEMENT_ENABLED,apiVersion:config.FACEBOOK_GRAPH_API_VERSION,
  requireMembership:requireWorkspaceMembership,decrypt:decryptToken,now:()=>new Date(),
  latestInbound:(socialAccountId,counterpartyId)=>facebookReceptionStore.latestInbound(socialAccountId,counterpartyId),
  getAccount:(workspaceId,socialAccountId)=>prisma.socialAccount.findFirst({where:{id:socialAccountId,workspaceId,platform:'facebook',accountType:'page',status:'active'},include:{credential:true}}),
  getPost:(workspaceId,scheduleId)=>prisma.schedule.findFirst({where:{id:scheduleId,workspaceId,status:'published'},include:{postVariant:true,publishJobs:{where:{status:'succeeded'},orderBy:{updatedAt:'desc'},take:1}}}),
  createClient:input=>createFacebookEngagementClient({...input,appId:config.FACEBOOK_CLIENT_ID,appSecret:config.FACEBOOK_CLIENT_SECRET})});
