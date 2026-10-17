import type {PrismaClient,Prisma} from '@prisma/client';
import {LOGIN_SESSION_MAX_AGE_MS} from '../utils/sessionLifetime';
import {HttpError} from '../utils/errors';
import type {SyncContext} from './types';
export async function requirePageSyncAccess(db:Pick<PrismaClient,'userSession'|'workspaceMember'>|Prisma.TransactionClient,ctx:SyncContext){
 const [session,member]=await Promise.all([
  db.userSession.findFirst({where:{id:ctx.sessionId,userId:ctx.userId,revokedAt:null,expiresAt:{gt:new Date()},createdAt:{gt:new Date(Date.now()-LOGIN_SESSION_MAX_AGE_MS)}}}),
  db.workspaceMember.findFirst({where:{workspaceId:ctx.workspaceId,userId:ctx.userId,status:'active',role:{in:['owner','admin']}}})
 ]);
 if(!session||!member)throw new HttpError(403,'Page sync requires an active workspace manager session');
}
