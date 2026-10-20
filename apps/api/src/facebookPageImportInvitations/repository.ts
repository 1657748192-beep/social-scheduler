import {createHash,randomBytes} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {HttpError} from '../utils/errors';
import {lockInvitationCreator,requireInvitationAccess} from './access';
import {day,invitationDeadline,invitationSummary,type InvitationContext,type CandidateEnvelope} from './types';
export const digestSecret=(secret:string)=>createHash('sha256').update(secret).digest('hex');
export function createInvitationRepository(deps:{db:PrismaClient;encrypt:(s:string)=>string;decrypt:(s:string)=>string;appId:string;now?:()=>Date}){
 const {db,encrypt,decrypt,appId}=deps,now=deps.now??(()=>new Date());
 return{
  async createInvitation(ctx:InvitationContext,note:string){
   await requireInvitationAccess(db,ctx,undefined,now());const safeNote=z.string().max(80).parse(note),at=now(),secret=randomBytes(32).toString('base64url');
   const row=await db.$transaction(async tx=>{await lockInvitationCreator(tx,ctx);await requireInvitationAccess(tx,ctx,undefined,now());return tx.facebookPageImportInvitation.create({data:{workspaceId:ctx.workspaceId,createdById:ctx.userId,note:safeNote,secretHash:digestSecret(secret),appId,createdAt:at,expiresAt:new Date(at.getTime()+day)}});});
   return{view:invitationSummary(row),secret};
  },
  async readPrivate(ctx:InvitationContext,id:string){await requireInvitationAccess(db,ctx,z.string().uuid().parse(id),now());const row=await db.facebookPageImportInvitation.findUniqueOrThrow({where:{id}});if(row.retentionExpiresAt&&row.retentionExpiresAt<=now())throw new HttpError(410,'Page import expired');return row;},
  encodeCandidates(input:CandidateEnvelope){const serialized=JSON.stringify(input);if(input.pages.length+input.rejected.length>2000||Buffer.byteLength(serialized)>4*1024*1024)throw new HttpError(400,'Page directory too large');return encrypt(serialized);},
  async candidates(row:import('./types').InvitationRecord):Promise<CandidateEnvelope>{
   if(!['authorized_pending_selection','importing'].includes(row.status)||invitationDeadline(row)<=now())throw new HttpError(410,'Page candidates unavailable');
   const saved=await db.facebookPageImportCandidate.findUnique({where:{invitationId:row.id}});if(!saved)throw new HttpError(410,'Page candidates unavailable');
   try{const data=JSON.parse(decrypt(saved.encryptedEnvelope)) as CandidateEnvelope;if(!data||data.appId!==row.appId||!/^\d{1,256}$/.test(data.providerUserId)||!Array.isArray(data.pages)||!Array.isArray(data.rejected))throw Error();
    data.pages=data.pages.map(p=>{const expiresAt=p.expiresAt===null?null:new Date(p.expiresAt);if(expiresAt&&!Number.isFinite(expiresAt.getTime()))throw Error();return{...p,expiresAt};});return data;
   }catch{throw new HttpError(503,'Page candidates unavailable');}
  }
 };
}
