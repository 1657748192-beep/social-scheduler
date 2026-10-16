import type {Prisma,PrismaClient,FacebookManagementOAuthState} from '@prisma/client';
import type {ManagementContext} from './types';
import {LOGIN_SESSION_MAX_AGE_MS} from '../utils/sessionLifetime';

export type ManagementGrant={appId:string;providerUserId:string;userToken:string;scopes:string[];expiresAt:Date|null;pages:Array<{
  pageId:string;name:string;pageToken:string|null;tasks:string[];scopes:string[];expiresAt:Date|null;profileUrl:string|null;avatarUrl:string|null;
}>};
export class ManagementAuthorizationError extends Error{constructor(){super('Facebook management authorization unavailable');}}
async function authorized(tx:Prisma.TransactionClient,ctx:ManagementContext,now:Date){
  // Hold the current session and membership through the grant transaction.
  await tx.$queryRaw`SELECT id FROM user_sessions WHERE id=${ctx.sessionId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM workspace_members WHERE user_id=${ctx.userId}::uuid AND workspace_id=${ctx.workspaceId}::uuid FOR UPDATE`;
  const session=await tx.userSession.findFirst({where:{id:ctx.sessionId,userId:ctx.userId,revokedAt:null,expiresAt:{gt:now},createdAt:{gt:new Date(now.getTime()-LOGIN_SESSION_MAX_AGE_MS)}}});
  const member=await tx.workspaceMember.findFirst({where:{userId:ctx.userId,workspaceId:ctx.workspaceId,status:'active',role:{in:['owner','admin']}}});
  if(!session||!member)throw new ManagementAuthorizationError();
}
export function createFacebookManagementStore(db:PrismaClient,encrypt:(value:string)=>string){
  return {
    async createState(input:ManagementContext&{appId:string;state:string;callbackUrl:string;connectionId?:string;now?:Date}){
      const now=input.now??new Date();
      return db.$transaction(async tx=>{
        await authorized(tx,input,now);
        const connection=input.connectionId?await tx.facebookManagementConnection.findFirst({where:{id:input.connectionId,workspaceId:input.workspaceId,userId:input.userId,status:'active'}}):null;
        if(input.connectionId&&!connection)throw new ManagementAuthorizationError();
        return tx.facebookManagementOAuthState.create({data:{appId:input.appId,state:input.state,userId:input.userId,workspaceId:input.workspaceId,sessionId:input.sessionId,callbackUrl:input.callbackUrl,connectionId:connection?.id,connectionVersion:connection?.version,expiresAt:new Date(now.getTime()+600000)}});
      });
    },
    async consumeState(state:string){
      const now=new Date();
      return db.$transaction(async tx=>{
        const claimed=await tx.facebookManagementOAuthState.updateMany({where:{state,consumedAt:null,expiresAt:{gt:now}},data:{consumedAt:now}});
        return claimed.count===1?tx.facebookManagementOAuthState.findUnique({where:{state}}):null;
      });
    },
    async saveGrant(input:FacebookManagementOAuthState,grant:ManagementGrant){
      if(!/^\d{1,256}$/.test(grant.providerUserId)||!grant.userToken||!grant.scopes.length||new Set(grant.pages.map(p=>p.pageId)).size!==grant.pages.length)throw new ManagementAuthorizationError();
      const now=new Date();
      if(grant.expiresAt&&grant.expiresAt<=now)throw new ManagementAuthorizationError();
      for(const p of grant.pages){if(!/^\d{1,256}$/.test(p.pageId)||!p.name.trim()||(p.expiresAt&&p.expiresAt<=now))throw new ManagementAuthorizationError();}
      try{return await db.$transaction(async tx=>{
        const state=await tx.facebookManagementOAuthState.findFirst({where:{id:input.id,state:input.state,consumedAt:{not:null},completedAt:null,expiresAt:{gt:now}}});
        if(!state||state.appId!==grant.appId)return null;
        await authorized(tx,state,now);
        const claimed=await tx.facebookManagementOAuthState.updateMany({where:{id:state.id,completedAt:null},data:{completedAt:now}});
        if(claimed.count!==1)return null;
        let connectionId=state.connectionId;
        if(connectionId){
          const changed=await tx.facebookManagementConnection.updateMany({where:{id:connectionId,appId:state.appId,userId:state.userId,workspaceId:state.workspaceId,status:'active',version:state.connectionVersion!,providerUserId:grant.providerUserId},data:{userTokenEncrypted:encrypt(grant.userToken),scopes:grant.scopes,expiresAt:grant.expiresAt,version:{increment:1},directoryReadAt:null}});
          if(changed.count!==1)return null;
          await tx.facebookManagedPage.updateMany({where:{connectionId},data:{active:false,pageTokenEncrypted:null,notificationsEnabled:false}});
        }else{
          const connection=await tx.facebookManagementConnection.create({data:{appId:state.appId,userId:state.userId,workspaceId:state.workspaceId,providerUserId:grant.providerUserId,userTokenEncrypted:encrypt(grant.userToken),scopes:grant.scopes,expiresAt:grant.expiresAt}});
          connectionId=connection.id;
        }
        for(const p of grant.pages){
          const data={name:p.name,profileUrl:p.profileUrl,avatarUrl:p.avatarUrl,pageTokenEncrypted:p.pageToken?encrypt(p.pageToken):null,tasks:p.tasks,scopes:p.scopes,expiresAt:p.expiresAt,active:true};
          await tx.facebookManagedPage.upsert({where:{connectionId_pageId:{connectionId,pageId:p.pageId}},create:{connectionId,pageId:p.pageId,...data},update:data});
        }
        return connectionId;
      });}catch(error){if(error instanceof ManagementAuthorizationError)throw error;throw new ManagementAuthorizationError();}
    },
    async findConnection(ctx:ManagementContext,id:string){
      return db.facebookManagementConnection.findFirst({where:{id,userId:ctx.userId,workspaceId:ctx.workspaceId},include:{pages:true}});
    },
    async disconnect(ctx:ManagementContext,id:string){
      return db.$transaction(async tx=>{
        await authorized(tx,ctx,new Date());
        const changed=await tx.facebookManagementConnection.updateMany({where:{id,workspaceId:ctx.workspaceId,userId:ctx.userId},data:{status:'disconnected',userTokenEncrypted:null,version:{increment:1}}});
        if(changed.count!==1)throw new ManagementAuthorizationError();
        await tx.facebookManagedPage.updateMany({where:{connectionId:id},data:{active:false,pageTokenEncrypted:null,notificationsEnabled:false}});
        await tx.facebookManagementPageSelection.deleteMany({where:{workspaceId:ctx.workspaceId,page:{connectionId:id}}});
      });
    }
  };
}
