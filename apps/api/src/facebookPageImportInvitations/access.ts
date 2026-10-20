import type {Prisma,PrismaClient} from '@prisma/client';
import {HttpError} from '../utils/errors';
import {LOGIN_SESSION_MAX_AGE_MS} from '../utils/sessionLifetime';
import type {InvitationContext,InvitationRecord} from './types';
type Db=Pick<PrismaClient,'user'|'userSession'|'workspaceMember'|'facebookPageImportInvitation'>|Prisma.TransactionClient;
export async function creatorActive(db:Db,row:Pick<InvitationRecord,'workspaceId'|'createdById'>){
 const [user,member]=await Promise.all([db.user.findUnique({where:{id:row.createdById},select:{id:true}}),db.workspaceMember.findFirst({where:{workspaceId:row.workspaceId,userId:row.createdById,status:'active',role:{in:['owner','admin']}}})]);return Boolean(user&&member);
}
export async function requireInvitationAccess(db:Db,ctx:InvitationContext,invitationId?:string,now=new Date()){
 const [session,member]=await Promise.all([db.userSession.findFirst({where:{id:ctx.sessionId,userId:ctx.userId,revokedAt:null,expiresAt:{gt:now},createdAt:{gt:new Date(now.getTime()-LOGIN_SESSION_MAX_AGE_MS)}}}),db.workspaceMember.findFirst({where:{workspaceId:ctx.workspaceId,userId:ctx.userId,status:'active',role:{in:['owner','admin']}}})]);
 if(!session||!member)throw new HttpError(403,'Page import requires a current workspace manager session');
 if(invitationId&&!await db.facebookPageImportInvitation.findFirst({where:{id:invitationId,workspaceId:ctx.workspaceId,createdById:ctx.userId}}))throw new HttpError(403,'Page import access denied');
}
export async function lockInvitationCreator(tx:Prisma.TransactionClient,ctx:InvitationContext){
 await tx.$queryRaw`SELECT id FROM user_sessions WHERE id=${ctx.sessionId}::uuid FOR UPDATE`;
 await tx.$queryRaw`SELECT id FROM workspace_members WHERE user_id=${ctx.userId}::uuid AND workspace_id=${ctx.workspaceId}::uuid FOR UPDATE`;
}
