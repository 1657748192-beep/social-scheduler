import test from 'node:test';import assert from 'node:assert/strict';
import {withInboxFixture} from './helpers/interactionInboxFixture';
import {config} from '../src/config';
async function service(f:any){const {inboxTestAccess}=await import('./helpers/interactionInboxServices');return inboxTestAccess(f);}
test('ordinaryOwnerAndNonmemberAdminAreDenied',async()=>withInboxFixture(async f=>{
 const s=await service(f),before=await f.protectedSnapshot();const old=config.ADMIN_EMAILS;config.ADMIN_EMAILS='';await assert.rejects(s.require(f.adminCtx,'read'),(e:any)=>e.statusCode===403);config.ADMIN_EMAILS=old;
 await assert.rejects(s.require({...f.adminCtx,workspaceId:'00000000-0000-4000-8000-000000000000'},'read'));
 await assert.rejects(s.resolveInboxAsset(f.adminCtx,f.accountIds[1],'messages.read'),(e:any)=>e.statusCode===404);
 const d=await import('../src/interactionInbox/directory');const directory=d.createInboxDirectory({db:f.db,access:s});
 const page=await directory.listInboxAccounts(f.adminCtx,{});assert.equal(page.items.length,1);assert.doesNotMatch(JSON.stringify(page),/sealed:|Encrypted|scopes|original-do-not-touch/);assert.deepEqual(await f.protectedSnapshot(),before);
 for(let i=0;i<51;i++)await f.db.socialAccount.create({data:{workspaceId:f.adminCtx.workspaceId,platform:'tiktok',providerAccountId:'tt'+i,displayName:'Same name'}});
 const first=await directory.listInboxAccounts(f.adminCtx,{platform:'tiktok'});assert.equal(first.items.length,50);const next=await directory.listInboxAccounts(f.adminCtx,{platform:'tiktok',cursor:first.nextCursor!});assert.equal(next.items.length,1);
 await assert.rejects(directory.listInboxAccounts(f.foreignCtx,{platform:'tiktok',cursor:first.nextCursor!}));
}));
test('samePageDifferentAppOrConnectionNeverFallsBack',async()=>withInboxFixture(async f=>{
 const s=await service(f);await f.seedVerifiedCase();const resolved=await s.resolveInboxAsset(f.adminCtx,f.accountIds[0],'messages.read');assert.equal(resolved.sourceRef?.managedPageId,f.pages[0].id);
 await f.db.facebookManagementConnection.update({where:{id:f.connections[0].id},data:{version:{increment:1}}});
 await assert.rejects(s.resolveCase(f.adminCtx,(await f.db.interactionCase.findFirstOrThrow({where:{workspaceId:f.adminCtx.workspaceId}})).id));
 await f.db.facebookManagementPageSelection.deleteMany({where:{workspaceId:f.adminCtx.workspaceId}});await assert.rejects(s.resolveInboxAsset(f.adminCtx,f.accountIds[0],'messages.read'));
}));
test('sessionExpiresWhileWaitingForLock rolls back local writes',async()=>withInboxFixture(async f=>{
 const s=await service(f);let release!:()=>void,ready!:()=>void;const held=new Promise<void>(r=>release=r),locked=new Promise<void>(r=>ready=r);
 const block=f.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM workspace_members WHERE user_id=${f.adminCtx.userId}::uuid FOR UPDATE`;ready();await held;},{timeout:10000});await locked;
 await f.db.userSession.update({where:{id:f.adminCtx.sessionId},data:{expiresAt:new Date(Date.now()+500)}});
 const work=s.write(f.adminCtx,async(tx:any)=>tx.interactionAudit.create({data:{workspaceId:f.adminCtx.workspaceId,actorId:f.adminCtx.userId,action:'test',targetId:'test',result:'bad'}}));const rejected=assert.rejects(work);await new Promise(r=>setTimeout(r,700));release();await block;await rejected;assert.equal(await f.db.interactionAudit.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
}));
