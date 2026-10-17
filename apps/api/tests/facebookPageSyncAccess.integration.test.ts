import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
test('sync access allows workspace managers, not editors, foreign sessions, revoked or legacy logins',async()=>{
 const mod=await import('../src/facebookPageSync/access').catch(()=>null);assert.ok(mod);
 await withFacebookManagementFixture(async(f:any)=>{
  const ctx=f.contexts[0];await mod.requirePageSyncAccess(f.db,ctx);
  await assert.rejects(mod.requirePageSyncAccess(f.db,{...ctx,sessionId:randomUUID()}));
  await assert.rejects(mod.requirePageSyncAccess(f.db,{...ctx,workspaceId:randomUUID()}));
  for(const role of ['editor','viewer']){await f.db.workspaceMember.updateMany({where:{workspaceId:ctx.workspaceId,userId:ctx.userId},data:{role:role as any}});await assert.rejects(mod.requirePageSyncAccess(f.db,ctx));}
  await f.db.workspaceMember.updateMany({where:{workspaceId:ctx.workspaceId,userId:ctx.userId},data:{role:'admin'}});await mod.requirePageSyncAccess(f.db,ctx);
  await f.db.userSession.update({where:{id:ctx.sessionId},data:{createdAt:new Date(Date.now()-25*3600000),expiresAt:new Date(Date.now()+86400000)}});await assert.rejects(mod.requirePageSyncAccess(f.db,ctx));
  await f.db.userSession.update({where:{id:ctx.sessionId},data:{createdAt:new Date(),revokedAt:new Date()}});await assert.rejects(mod.requirePageSyncAccess(f.db,ctx));
 });
});
