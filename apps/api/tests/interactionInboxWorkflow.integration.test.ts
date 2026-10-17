import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {withInboxFixture} from './helpers/interactionInboxFixture';import {inboxTestAccess} from './helpers/interactionInboxServices';
test('unreadAndResolutionAreIndependent',async()=>withInboxFixture(async f=>{
 const m=await import('../src/interactionInbox/cases').catch(()=>null);assert.ok(m,'case workflow required');const s=m.createInboxCases({db:f.db,access:inboxTestAccess(f)}),c=await f.seedVerifiedCase();
 const r=await s.updateCase(f.adminCtx,c.id,{status:'resolved',version:1});assert.equal(r.status,'resolved');await assert.rejects(s.updateCase(f.adminCtx,c.id,{status:'pending',version:1}));
 await assert.rejects(s.updateCase(f.adminCtx,c.id,{assigneeId:randomUUID(),version:2}));
 await f.db.interactionItem.create({data:{workspaceId:c.workspaceId,caseId:c.id,assetId:c.assetId,platform:'facebook',providerEventId:'msg-1',occurredAt:c.lastInboundAt!,direction:'inbound',sourceRef:c.sourceRef!}});
 await s.markRead(f.adminCtx,c.id,{eventAt:c.lastInboundAt!.toISOString(),eventKey:'msg-1',version:2});assert.equal((await s.getCaseDto(f.adminCtx,c.id)).unread,false);
 await assert.rejects(s.markRead(f.adminCtx,c.id,{eventAt:new Date().toISOString(),eventKey:'future-fake',version:2}));
 assert.equal(await f.db.readReceipt.count({where:{userId:f.viewerCtx.userId}}),0);await assert.rejects(s.updateCase(f.viewerCtx,c.id,{status:'pending',version:2}));
}));
