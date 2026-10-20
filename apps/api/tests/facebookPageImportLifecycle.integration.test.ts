import assert from 'node:assert/strict';import test from 'node:test';
import {createMetaGrantFence} from '../src/interactionInbox/grantFence';
import {withPageImportFixture,preparePageInvitation} from './helpers/facebookPageImportInvitationsFixture';
import {createFacebookPageImportInvitationService} from '../src/facebookPageImportInvitations/service';
test('a grant cutoff rejects a previously authorized confirmation without touching publishing',()=>withPageImportFixture(async f=>{
 const {id,repo}=await preparePageInvitation(f),before=await f.snapshot();
 await f.db.$transaction((tx:any)=>createMetaGrantFence().advance(tx,{platform:'facebook',appId:'123'},'900',new Date(Date.now()+1000)));
 const service=createFacebookPageImportInvitationService({...f,repo,appId:'123',graph:{revalidate:async(p:any)=>p}});
 await assert.rejects(service.confirm(f.ctx,id,['101']));assert.deepEqual(await f.snapshot(),before);
 await f.db.metaInboxGrantFence.deleteMany({where:{appId:'123',subjectHash:createMetaGrantFence().subjectHash({platform:'facebook',appId:'123'},'900')}});
}));
test('subject deletion clears only matching invitation envelopes, not existing publishing records',async()=>{
 const mod=await import('../src/facebookPageImportInvitations/deletion').catch(()=>null);assert.ok(mod,'invitation deletion integration must exist');
 await withPageImportFixture(async f=>{const a=await preparePageInvitation(f),b=await preparePageInvitation(f),before=await f.snapshot();
 await f.db.facebookPageImportInvitation.update({where:{id:b.id},data:{appId:'456'}});
 const subjectHash=createMetaGrantFence().subjectHash({platform:'facebook',appId:'123'},'900');
 await f.db.$transaction((tx:any)=>mod.invalidatePageImportInvitations(tx,{platform:'facebook',appId:'123'},subjectHash,new Date(Date.now()+1000)));
 assert.equal(await f.db.facebookPageImportCandidate.count({where:{invitationId:a.id}}),0);assert.equal(await f.db.facebookPageImportCandidate.count({where:{invitationId:b.id}}),1);assert.deepEqual(await f.snapshot(),before);
 });
});
test('expired candidates are unreadable before bounded cleanup, which does not extend retention',async()=>{
 const mod=await import('../src/facebookPageImportInvitations/maintenance').catch(()=>null);assert.ok(mod,'bounded invitation maintenance must exist');
 await withPageImportFixture(async f=>{const a=await preparePageInvitation(f),b=await preparePageInvitation(f),deadline=new Date(Date.now()-1000);
 await f.db.facebookPageImportInvitation.updateMany({where:{id:{in:[a.id,b.id]}},data:{candidateExpiresAt:deadline}});
 await assert.rejects(a.repo.candidates(await a.repo.readPrivate(f.ctx,a.id)));
 assert.equal((await mod.runInvitationMaintenance(f.db,new Date(),1)).cleared,1);
 assert.equal(await f.db.facebookPageImportCandidate.count({where:{invitationId:{in:[a.id,b.id]}}}),1);
 await mod.runInvitationMaintenance(f.db,new Date(),50);
 const rows=await f.db.facebookPageImportInvitation.findMany({where:{id:{in:[a.id,b.id]}}});assert.ok(rows.every((r:any)=>r.status==='expired'&&r.terminalAt.getTime()===deadline.getTime()&&r.retentionExpiresAt.getTime()===deadline.getTime()+30*86400000));
 });
});
test('manager retirement permanently disables outstanding invitations after re-promotion',async()=>{
 await withPageImportFixture(async f=>{const a=await preparePageInvitation(f);const {retireFacebookManagementAuthorizer}=await import('../src/facebookManagement/store');
 await f.db.$transaction((tx:any)=>retireFacebookManagementAuthorizer(tx,f.ctx.workspaceId,f.userId));
 assert.equal((await a.repo.readPrivate(f.ctx,a.id)).status,'revoked');assert.equal(await f.db.facebookPageImportCandidate.count({where:{invitationId:a.id}}),0);
 });
});
