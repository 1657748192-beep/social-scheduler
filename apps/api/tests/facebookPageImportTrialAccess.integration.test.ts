import assert from 'node:assert/strict';import test from 'node:test';
import {withPageImportFixture,preparePageInvitation} from './helpers/facebookPageImportInvitationsFixture';
import {config} from '../src/config';import {createInvitationRepository} from '../src/facebookPageImportInvitations/repository';
import {createFacebookPageImportInvitationService} from '../src/facebookPageImportInvitations/service';
import {creatorActive} from '../src/facebookPageImportInvitations/access';
test('ordinary workspace owners and admins can create and list only their own invitations',()=>withPageImportFixture(async f=>{
 const before=await f.snapshot(),original=config.ADMIN_EMAILS;config.ADMIN_EMAILS='';
 try{const repo=createInvitationRepository({...f,appId:'123'}),service=createFacebookPageImportInvitationService({...f,appId:'123',repo,graph:{revalidate:async(p:any)=>p}});
 for(const role of ['owner','admin']){
  await f.db.workspaceMember.updateMany({where:{userId:f.userId,workspaceId:f.ctx.workspaceId},data:{role}});
  const created=await repo.createInvitation(f.ctx,role);
  assert.ok((await service.list(f.ctx)).items.some((item:any)=>item.id===created.view.id));
  assert.equal(await creatorActive(f.db,{workspaceId:f.ctx.workspaceId,createdById:f.userId}),true);
 }
 assert.equal(await f.db.facebookPageImportInvitation.count({where:{createdById:f.userId}}),2);assert.deepEqual(await f.snapshot(),before);
 }finally{config.ADMIN_EMAILS=original;}
}));
test('platform-admin status is irrelevant to an active creator reading and confirming their own selected Pages',()=>withPageImportFixture(async f=>{
 const original=config.ADMIN_EMAILS;config.ADMIN_EMAILS=`${f.userId}@example.test`;
 try{const {id,repo}=await preparePageInvitation(f),service=createFacebookPageImportInvitationService({...f,appId:'123',repo,graph:{revalidate:async(p:any)=>p}}),before=await f.snapshot();
 config.ADMIN_EMAILS='';assert.equal((await service.view(f.ctx,id)).id,id);
 assert.deepEqual(await service.confirm(f.ctx,id,['100','101']),{createdPageIds:['101'],skippedPageIds:['100']});
 assert.equal(await f.db.socialAccount.count({where:{workspaceId:f.ctx.workspaceId,providerAccountId:'102'}}),0);
 assert.equal(await creatorActive(f.db,{workspaceId:f.ctx.workspaceId,createdById:f.userId}),true);assert.deepEqual(await f.snapshot(),before);
 }finally{config.ADMIN_EMAILS=original;}
}));

test('editors, viewers, inactive membership and revoked sessions cannot use private Page import operations',()=>withPageImportFixture(async f=>{
 const {id,repo}=await preparePageInvitation(f),service=createFacebookPageImportInvitationService({...f,appId:'123',repo,graph:{revalidate:async(p:any)=>p}}),before=await f.snapshot();
 for(const role of ['editor','viewer']){
  await f.db.workspaceMember.updateMany({where:{userId:f.userId,workspaceId:f.ctx.workspaceId},data:{role}});
  for(const operation of [()=>repo.createInvitation(f.ctx,''),()=>service.list(f.ctx),()=>service.view(f.ctx,id),()=>service.confirm(f.ctx,id,['101']),()=>service.revoke(f.ctx,id)])await assert.rejects(operation,(e:any)=>e.statusCode===403);
  assert.equal(await creatorActive(f.db,{workspaceId:f.ctx.workspaceId,createdById:f.userId}),false);
 }
 await f.db.workspaceMember.updateMany({where:{userId:f.userId,workspaceId:f.ctx.workspaceId},data:{role:'owner',status:'disabled'}});
 await assert.rejects(service.list(f.ctx),(e:any)=>e.statusCode===403);
 await f.db.workspaceMember.updateMany({where:{userId:f.userId,workspaceId:f.ctx.workspaceId},data:{status:'active'}});
 await f.db.userSession.update({where:{id:f.ctx.sessionId},data:{revokedAt:new Date()}});
 await assert.rejects(repo.createInvitation(f.ctx,''),(e:any)=>e.statusCode===403);await assert.rejects(service.confirm(f.ctx,id,['101']),(e:any)=>e.statusCode===403);
 assert.deepEqual(await f.snapshot(),before);
}));
