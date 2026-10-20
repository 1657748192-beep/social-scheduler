import type {PrismaClient} from '@prisma/client';
import {HttpError} from '../utils/errors';
import {createMetaGrantFence} from '../interactionInbox/grantFence';
import {creatorActive} from './access';
import {digestSecret,type createInvitationRepository} from './repository';
import {day,terminalFields} from './types';
import type {createInvitationFlows,InvitationFlow} from './flows';
import type {createFacebookPageSyncGraph} from '../facebookPageSync/graph';
export function createInvitationOAuth(deps:{db:PrismaClient;appId:string;repo:ReturnType<typeof createInvitationRepository>;flows:ReturnType<typeof createInvitationFlows>;graph:Pick<ReturnType<typeof createFacebookPageSyncGraph>,'authorizationUrl'|'discover'>}){
 const {db,repo,flows,graph,appId}=deps,fence=createMetaGrantFence();
 async function retire(id:string){await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "FacebookPageImportInvitation" WHERE id=${id}::uuid FOR UPDATE`;const row=await tx.facebookPageImportInvitation.findUnique({where:{id}});if(row&&['awaiting_authorization','authorized_pending_selection','importing'].includes(row.status)&&!await creatorActive(tx,row)){await tx.facebookPageImportCandidate.deleteMany({where:{invitationId:id}});await tx.facebookPageImportInvitation.update({where:{id},data:terminalFields('revoked',new Date())});}});}
 return{
  async beginPublicFlow(secret:string,existingFlowCookie?:string){
   if(!/^[A-Za-z0-9_-]{43}$/.test(secret))throw new HttpError(410,'Authorization link unavailable');
   const row=await db.facebookPageImportInvitation.findUnique({where:{secretHash:digestSecret(secret)}});
   if(!row||row.appId!==appId||row.status!=='awaiting_authorization'||row.expiresAt<=new Date())throw new HttpError(410,'Authorization link unavailable');
   if(!await creatorActive(db,row)){await retire(row.id);throw new HttpError(410,'Authorization link unavailable');}
   const flow=await flows.begin({invitationId:row.id,version:row.version},existingFlowCookie);
   try{return{authorizationUrl:graph.authorizationUrl(flow.state),cookie:flow.cookie};}catch(error){await flows.release(flow);throw error;}
  },
  async completePublicFlow(input:{state:string;code?:string;error?:string;flowCookie?:string}):Promise<'received'|'unavailable'>{
   let flow:InvitationFlow|undefined;
   try{
    flow=await flows.consume(input.state,input.flowCookie);
    if(input.error||!input.code||input.code.length>8192)return'unavailable';
    const before=await db.facebookPageImportInvitation.findUnique({where:{id:flow.invitationId}});
    if(!before||before.appId!==appId||before.version!==flow.version||before.status!=='awaiting_authorization'||before.expiresAt<=new Date())return'unavailable';
    if(!await creatorActive(db,before)){await retire(before.id);return'unavailable';}
    const result=await graph.discover(input.code);
    if(!/^\d{1,256}$/.test(result.providerUserId)||result.pages.length+result.rejected.length===0||!await flows.active(flow))return'unavailable';
    const startedAt=new Date(flow.startedAt),subjectHash=fence.subjectHash({platform:'facebook',appId},result.providerUserId);
    const encrypted=repo.encodeCandidates({...result,appId,authorizationStartedAt:startedAt.toISOString()});
    const claimed=flow;
    const saved=await db.$transaction(async tx=>{
     const barrier=await fence.lockAndRead(tx,{platform:'facebook',appId},result.providerUserId);if(barrier&&startedAt<=barrier.cutoff)return false;
     await tx.$queryRaw`SELECT id FROM workspace_members WHERE user_id=${before.createdById}::uuid AND workspace_id=${before.workspaceId}::uuid FOR UPDATE`;
     await tx.$queryRaw`SELECT id FROM "FacebookPageImportInvitation" WHERE id=${before.id}::uuid FOR UPDATE`;
     const row=await tx.facebookPageImportInvitation.findUnique({where:{id:before.id}}),at=new Date();
     if(!row||row.appId!==appId||row.version!==claimed.version||row.status!=='awaiting_authorization'||row.expiresAt<=at||claimed.expiresAt<=at.getTime())return false;
     if(!await creatorActive(tx,row)){await tx.facebookPageImportInvitation.update({where:{id:row.id},data:terminalFields('revoked',at)});return false;}
     await tx.facebookPageImportCandidate.create({data:{invitationId:row.id,encryptedEnvelope:encrypted}});
     await tx.facebookPageImportInvitation.update({where:{id:row.id},data:{status:'authorized_pending_selection',version:{increment:1},authorizedAt:at,authorizationStartedAt:startedAt,authorizerSubjectHash:subjectHash,candidateExpiresAt:new Date(Math.min(at.getTime()+day,row.createdAt.getTime()+2*day))}});return true;
    });return saved?'received':'unavailable';
   }catch{return'unavailable';}finally{if(flow)await flows.release(flow).catch(()=>{});}
  }
 };
}
