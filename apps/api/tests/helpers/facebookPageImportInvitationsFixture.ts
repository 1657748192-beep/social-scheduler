import {withFacebookManagementFixture} from './facebookManagementFixture';
import {encryptToken,decryptToken} from '../../src/utils/tokenCrypto';
import {createInvitationRepository} from '../../src/facebookPageImportInvitations/repository';
import {createMetaGrantFence} from '../../src/interactionInbox/grantFence';
import {randomUUID} from 'node:crypto';
import {config} from '../../src/config';
export const importTestPage=(id:string)=>({pageId:id,name:'Page '+id,avatarUrl:null,profileUrl:'https://www.facebook.com/'+id,pageToken:'synthetic-page-'+id,scopes:['pages_manage_posts','pages_read_engagement'],expiresAt:null});
export async function withPageImportFixture(run:(f:any)=>Promise<void>){
 await withFacebookManagementFixture(async f=>{
  const previousAdmins=config.ADMIN_EMAILS;config.ADMIN_EMAILS=[previousAdmins,`${f.userId}@example.test`].filter(Boolean).join(',');
  const ctx=f.contexts[0];
  const post=await f.db.post.create({data:{workspaceId:ctx.workspaceId,authorId:f.userId,baseText:'Existing scheduled content',variants:{create:{platform:'facebook',socialAccountId:f.accounts[0].id,text:'Existing scheduled content'}}},include:{variants:true}});
  await f.db.schedule.create({data:{workspaceId:ctx.workspaceId,postVariantId:post.variants[0].id,createdBy:f.userId,scheduledAt:new Date(Date.now()+86400000),publishJobs:{create:{postVariantId:post.variants[0].id,workspaceId:ctx.workspaceId,idempotencyKey:randomUUID(),status:'waiting'}}}});
  const oldIds=f.accounts.map((a:any)=>a.id);
  const snapshot=async()=>({
   accounts:await f.db.socialAccount.findMany({where:{id:{in:oldIds}},include:{credential:true},orderBy:{id:'asc'}}),
   posts:await f.db.postVariant.findMany({where:{post:{workspaceId:{in:f.workspaceIds}}},orderBy:{id:'asc'}}),
   schedules:await f.db.schedule.findMany({where:{workspaceId:{in:f.workspaceIds}},include:{publishJobs:true},orderBy:{id:'asc'}}),
   management:await f.db.facebookManagementConnection.findMany({where:{workspaceId:{in:f.workspaceIds}},include:{pages:true},orderBy:{id:'asc'}})
  });
  try{await run({...f,ctx,snapshot,encrypt:encryptToken,decrypt:decryptToken});}
  finally{config.ADMIN_EMAILS=previousAdmins;await f.db.facebookPageImportInvitation.deleteMany({where:{createdById:f.userId}});}
 });
}
export async function preparePageInvitation(f:any,pages=['100','101','102'].map(importTestPage)){
 const repo=createInvitationRepository({...f,appId:'123'}),created=await repo.createInvitation(f.ctx,''),started=new Date();
 const envelope={providerUserId:'900',appId:'123',authorizationStartedAt:started.toISOString(),pages,rejected:[]};
 await f.db.facebookPageImportInvitation.update({where:{id:created.view.id},data:{status:'authorized_pending_selection',authorizedAt:started,authorizationStartedAt:started,authorizerSubjectHash:createMetaGrantFence().subjectHash({platform:'facebook',appId:'123'},'900'),candidateExpiresAt:new Date(Date.now()+86400000),candidate:{create:{encryptedEnvelope:repo.encodeCandidates(envelope)}}}});
 return{id:created.view.id,repo};
}
