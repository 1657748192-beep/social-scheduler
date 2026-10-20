import assert from 'node:assert/strict';import test from 'node:test';
import {withPageImportFixture,preparePageInvitation,importTestPage} from './helpers/facebookPageImportInvitationsFixture';
const load=async()=>import('../src/facebookPageImportInvitations/service').catch(()=>null);
test('confirm imports only selected new pages and records a durable immutable result',async()=>{
 const mod=await load();assert.ok(mod,'invitation confirmation service must exist');await withPageImportFixture(async f=>{
 const {id,repo}=await preparePageInvitation(f),graph={revalidate:async(p:any)=>p},service=mod.createFacebookPageImportInvitationService({...f,appId:'123',repo,graph}),before=await f.snapshot();
 const view=await service.view(f.ctx,id);assert.equal(view.pages.find((p:any)=>p.pageId==='100').existing,true);assert.doesNotMatch(JSON.stringify(view),/pageToken|synthetic-page|scopes|secretHash|providerUserId/);
 await assert.rejects(service.confirm(f.ctx,id,['999']));await assert.rejects(service.confirm(f.ctx,id,Array.from({length:51},(_,i)=>String(i+100))));
 const result=await service.confirm(f.ctx,id,['100','101']);assert.deepEqual(result,{createdPageIds:['101'],skippedPageIds:['100']});assert.deepEqual(await f.snapshot(),before);
 assert.equal(await f.db.socialAccount.count({where:{workspaceId:f.ctx.workspaceId,providerAccountId:'102'}}),0);
 assert.deepEqual(await service.confirm(f.ctx,id,['101','100']),result);await assert.rejects(service.confirm(f.ctx,id,['102']));assert.equal(await f.db.facebookPageImportCandidate.count({where:{invitationId:id}}),0);
 });
});
test('empty completion is allowed only when no eligible new pages remain',async()=>{
 const mod=await load();assert.ok(mod);await withPageImportFixture(async f=>{
 const a=await preparePageInvitation(f,[importTestPage('100')]),b=await preparePageInvitation(f,[importTestPage('101')]);
 const service=mod.createFacebookPageImportInvitationService({...f,appId:'123',repo:a.repo,graph:{revalidate:async(p:any)=>p}});
 await assert.rejects(service.completeEmpty(f.ctx,b.id));assert.deepEqual(await service.completeEmpty(f.ctx,a.id),{createdPageIds:[],skippedPageIds:['100']});
 assert.equal(await f.db.facebookPageImportCandidate.count({where:{invitationId:a.id}}),0);
 });
});
