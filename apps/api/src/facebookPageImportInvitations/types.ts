import type {FacebookPageImportInvitation} from '@prisma/client';
import type {SyncContext,VerifiedPage,PageCandidate,SyncResult} from '../facebookPageSync/types';
export type InvitationContext=SyncContext;
export type InvitationResult=SyncResult;
export type CandidateEnvelope={providerUserId:string;appId:string;authorizationStartedAt:string;pages:VerifiedPage[];rejected:PageCandidate[]};
export type InvitationRecord=FacebookPageImportInvitation;
export type InvitationSummary={id:string;workspaceId:string;note:string;status:string;authorizationOutcome?:'no_new_pages'|'all_existing'|'read_failed';createdAt:string;expiresAt:string;candidateExpiresAt:string|null;retentionExpiresAt:string|null;result:InvitationResult|null};
export type InvitationView=InvitationSummary&{pages:PageCandidate[];selectedPageIds?:string[]};
export const day=86400000;
export function invitationDeadline(row:InvitationRecord){return row.candidateExpiresAt??row.expiresAt;}
export function terminalFields(status:'completed'|'revoked'|'expired'|'cancelled',at:Date){return{status,terminalAt:at,retentionExpiresAt:new Date(at.getTime()+30*day),version:{increment:1}};}
export function invitationSummary(row:InvitationRecord):InvitationSummary{return{id:row.id,workspaceId:row.workspaceId,note:row.note,status:row.status,createdAt:row.createdAt.toISOString(),expiresAt:row.expiresAt.toISOString(),candidateExpiresAt:row.candidateExpiresAt?.toISOString()??null,retentionExpiresAt:row.retentionExpiresAt?.toISOString()??null,result:row.result as InvitationResult|null};}
