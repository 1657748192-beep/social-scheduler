import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {withPageImportFixture as withFacebookManagementFixture} from './helpers/facebookPageImportInvitationsFixture';
import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
const load=async()=>import('../src/facebookPageImportInvitations/repository').catch(()=>null);
test('invitation has fixed lifetime and stores only a digest of the share secret',async()=>{
 const mod=await load();assert.ok(mod,'invitation repository must exist');
 await withFacebookManagementFixture(async f=>{try{
 const repo=mod.createInvitationRepository({db:f.db,encrypt:encryptToken,decrypt:decryptToken,appId:'123'}),ctx=f.contexts[0],before=await f.snapshot();
 const created=await repo.createInvitation(ctx,'Partner A');
 assert.match(created.secret,/^[A-Za-z0-9_-]{43}$/);assert.equal(Date.parse(created.view.expiresAt)-Date.parse(created.view.createdAt),86400000);
 const row=await f.db.facebookPageImportInvitation.findUniqueOrThrow({where:{id:created.view.id}});
 assert.equal(row.secretHash,createHash('sha256').update(created.secret).digest('hex'));assert.doesNotMatch(JSON.stringify(row),new RegExp(created.secret));
 assert.equal(row.status,'awaiting_authorization');assert.deepEqual(await f.snapshot(),before);
 }finally{await f.db.facebookPageImportInvitation.deleteMany({where:{createdById:f.userId}});}});
});
test('creator can resume from a new session but a foreign creator or viewer cannot read',async()=>{
 const mod=await load();assert.ok(mod,'invitation repository must exist');
 await withFacebookManagementFixture(async f=>{try{
 const repo=mod.createInvitationRepository({db:f.db,encrypt:encryptToken,decrypt:decryptToken,appId:'123'}),ctx=f.contexts[0],created=await repo.createInvitation(ctx,'');
 const session=await f.db.userSession.create({data:{userId:f.userId,tokenId:randomUUID(),expiresAt:new Date(Date.now()+86400000)}});
 await f.db.userSession.update({where:{id:ctx.sessionId},data:{revokedAt:new Date()}});
 assert.equal((await repo.readPrivate({...ctx,sessionId:session.id},created.view.id)).id,created.view.id);
 await assert.rejects(repo.readPrivate(ctx,created.view.id));await assert.rejects(repo.readPrivate({...f.contexts[1],sessionId:session.id},created.view.id));
 await f.db.workspaceMember.update({where:{workspaceId_userId:{workspaceId:ctx.workspaceId,userId:f.userId}},data:{role:'viewer'}});
 await assert.rejects(repo.readPrivate({...ctx,sessionId:session.id},created.view.id));
 }finally{await f.db.facebookPageImportInvitation.deleteMany({where:{createdById:f.userId}});}});
});
