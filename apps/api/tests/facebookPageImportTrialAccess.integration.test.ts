import assert from 'node:assert/strict';import test from 'node:test';
import {withPageImportFixture,preparePageInvitation} from './helpers/facebookPageImportInvitationsFixture';
import {config} from '../src/config';import {createInvitationRepository} from '../src/facebookPageImportInvitations/repository';
import {createFacebookPageImportInvitationService} from '../src/facebookPageImportInvitations/service';
import {creatorActive} from '../src/facebookPageImportInvitations/access';
test('ordinary workspace owner cannot create or list trial invitations',()=>withPageImportFixture(async f=>{
 const before=await f.snapshot(),original=config.ADMIN_EMAILS;config.ADMIN_EMAILS='';
 try{const repo=createInvitationRepository({...f,appId:'123'}),service=createFacebookPageImportInvitationService({...f,appId:'123',repo,graph:{revalidate:async(p:any)=>p}});
 await assert.rejects(repo.createInvitation(f.ctx,''),(e:any)=>e.statusCode===403);await assert.rejects(service.list(f.ctx),(e:any)=>e.statusCode===403);
 assert.equal(await f.db.facebookPageImportInvitation.count({where:{createdById:f.userId}}),0);assert.deepEqual(await f.snapshot(),before);
 }finally{config.ADMIN_EMAILS=original;}
}));
test('removing platform-admin eligibility blocks existing task details, confirmation and public creator admission',()=>withPageImportFixture(async f=>{
 const original=config.ADMIN_EMAILS;config.ADMIN_EMAILS=`${f.userId}@example.test`;
 try{const {id,repo}=await preparePageInvitation(f),service=createFacebookPageImportInvitationService({...f,appId:'123',repo,graph:{revalidate:async(p:any)=>p}}),before=await f.snapshot();
 config.ADMIN_EMAILS='';await assert.rejects(service.view(f.ctx,id),(e:any)=>e.statusCode===403);await assert.rejects(service.confirm(f.ctx,id,['101']),(e:any)=>e.statusCode===403);
 assert.equal(await creatorActive(f.db,{workspaceId:f.ctx.workspaceId,createdById:f.userId}),false);assert.deepEqual(await f.snapshot(),before);
 }finally{config.ADMIN_EMAILS=original;}
}));
