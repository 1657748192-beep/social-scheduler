import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
import type {Scope} from '../../src/interactionInbox/types';
import {withFacebookManagementFixture} from './facebookManagementFixture';
import {config} from '../../src/config';
export async function withInboxFixture(run:(f:InboxFixture)=>Promise<void>){
 await withFacebookManagementFixture(async base=>{
  const db=base.db as PrismaClient,oldAdmin=config.ADMIN_EMAILS;
  const user=await db.user.findUniqueOrThrow({where:{id:base.userId}});config.ADMIN_EMAILS=user.email;
  const viewer=await db.user.create({data:{email:randomUUID()+'@example.test',name:'Viewer',passwordHash:'synthetic'}});
  const vs=await db.userSession.create({data:{userId:viewer.id,tokenId:randomUUID(),expiresAt:new Date(Date.now()+86400000)}});
  await db.workspaceMember.create({data:{workspaceId:base.workspaceIds[0],userId:viewer.id,role:'viewer'}});
  const ctxs=base.contexts as Scope[],adminCtx=ctxs[0],foreignCtx=ctxs[1];
  const protectedSnapshot=async()=>({accounts:await db.socialAccount.findMany({include:{credential:true},orderBy:{id:'asc'}}),connections:await db.facebookManagementConnection.findMany({include:{pages:true},orderBy:{id:'asc'}}),selections:await db.facebookManagementPageSelection.findMany({orderBy:{id:'asc'}}),posts:await db.post.findMany({include:{variants:{include:{media:true}}},orderBy:{id:'asc'}}),schedules:await db.schedule.findMany({include:{publishJobs:true},orderBy:{id:'asc'}}),oauthStates:await db.oauthState.findMany({orderBy:{id:'asc'}}),authorizationLinks:await db.oauthAuthorizationLink.findMany({orderBy:{id:'asc'}})});
  const seedVerifiedCase=async(index=0,actorId='300',name='Same Name')=>{
   const ctx=ctxs[index],page=base.pages[index];
   const canonicalKey=JSON.stringify(['facebook','123','100']);
   const asset=await db.interactionAsset.upsert({where:{workspaceId_canonicalKey:{workspaceId:ctx.workspaceId,canonicalKey}},create:{workspaceId:ctx.workspaceId,canonicalKey,platform:'facebook',appNamespace:'123',providerAssetId:'100',facebookManagedPageId:page.id,connectionVersion:1},update:{}});
   const customer=await db.interactionCustomer.create({data:{workspaceId:ctx.workspaceId}});
   await db.interactionIdentity.create({data:{workspaceId:ctx.workspaceId,assetId:asset.id,customerId:customer.id,platform:'facebook',appNamespace:'123',providerActorId:actorId,displayName:name}});
   return db.interactionCase.create({data:{workspaceId:ctx.workspaceId,assetId:asset.id,customerId:customer.id,kind:'messages',providerThreadOrEventId:'thread-'+actorId,sourceRef:{managedPageId:page.id,connectionId:base.connections[index].id,connectionVersion:1,conversationId:'thread-'+actorId,participantId:actorId},lastInboundAt:new Date(),lastInboundKey:'msg-1'}});
  };
  try{await run({...base,db,adminCtx,foreignCtx,viewerCtx:{userId:viewer.id,sessionId:vs.id,workspaceId:adminCtx.workspaceId},accountIds:base.accounts.map((a:any)=>a.id),protectedSnapshot,seedVerifiedCase});}
  finally{config.ADMIN_EMAILS=oldAdmin;await db.user.delete({where:{id:viewer.id}});}
 });
}
export type InboxFixture={db:PrismaClient;adminCtx:Scope;foreignCtx:Scope;viewerCtx:Scope;accountIds:string[];pages:any[];connections:any[];workspaceIds:string[];userId:string;sessionId:string;protectedSnapshot():Promise<unknown>;seedVerifiedCase(index?:number,actorId?:string,name?:string):ReturnType<PrismaClient['interactionCase']['create']>};
