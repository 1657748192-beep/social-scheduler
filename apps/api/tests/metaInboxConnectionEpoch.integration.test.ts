import test from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';
import {withMetaInboxFixture,type MetaInboxFixture} from './helpers/metaInboxFixture';
import {seedDeletionCustomer} from './helpers/metaInboxDeletionFixture';
import {createMetaInboxDeletion,type MetaDeletionAsset} from '../src/interactionInbox/deletion';
import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
const key='synthetic-epoch-deletion-key-only';
const service=(f:MetaInboxFixture)=>createMetaInboxDeletion({db:f.db,hmacKey:key,encrypt:encryptToken,decrypt:decryptToken});
const asset=(f:MetaInboxFixture):MetaDeletionAsset=>({workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1});
async function recreate(f:MetaInboxFixture){
 await f.db.instagramManagementConnection.delete({where:{id:f.instagramConnectionIds[0]}});
 const c=await f.db.instagramManagementConnection.create({data:{workspaceId:f.adminCtx.workspaceId,appId:'456',providerAccountId:'100',providerUserId:'200',userId:f.userId,status:'active',tokenEncrypted:'sealed:new-connection',authorizedAt:new Date()}});f.instagramConnectionIds[0]=c.id;return asset(f);
}
async function purge(d:ReturnType<typeof service>,code:string){
 let done=false;for(let i=0;i<30&&!done;i++)done=(await d.purgeSources(code,2)).sourcesComplete;assert.equal(done,true);
 done=false;for(let i=0;i<100&&!done;i++){const r=await d.purgeDerived(code,2);assert.equal(r.blocked,null);done=r.complete;}assert.equal(done,true);
}
test('recreatedConnectionDoesNotInheritTheDeletedConnectionsVersionOneMarker',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),old=asset(f),receipt=await d.disconnect(old),next=await recreate(f),occurredAt=new Date();
 const request=await f.db.metaInboxDeletionRequest.findUniqueOrThrow({where:{confirmationCode:receipt.confirmationCode}});assert.ok(occurredAt>request.createdAt);
 const subject={actorId:'301',providerEventId:'fresh-event',eventKind:'messages' as const,occurredAt};
 assert.equal(await f.db.$transaction(tx=>d.isDeleted(tx,{...next,...subject})),false);
 assert.equal(await f.db.$transaction(tx=>d.isDeleted(tx,{...old,...subject})),true);
}));
test('newConnectionDeletionCannotAliasACompletedOldChildJob',async()=>withMetaInboxFixture(async f=>{
 const d=service(f);await seedDeletionCustomer(f);const before=await f.publishingSnapshot(),old=await d.disconnect(asset(f));await purge(d,old.confirmationCode);assert.equal(await d.status(old.confirmationCode),'completed');
 const next=await recreate(f),fresh=await seedDeletionCustomer(f,'301'),receipt=await d.disconnect(next);
 assert.notEqual(receipt.confirmationCode,old.confirmationCode);assert.equal(await d.status(receipt.confirmationCode),'pending');await purge(d,receipt.confirmationCode);
 assert.equal(await f.db.customerNote.findUnique({where:{id:fresh.note.id}}),null);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('sourceWithoutImmutableConnectionIdentityCannotBeAccepted',async()=>withMetaInboxFixture(async f=>{
 const {connectionId:_,...missing}=asset(f),d=service(f);
 await assert.rejects(f.db.$transaction(tx=>d.isDeleted(tx,{...missing,actorId:'300',providerEventId:'unscoped',eventKind:'messages',occurredAt:new Date()} as any)));
}));
test('legacyEncryptedLocatorsAndAmbiguousLegacyMarkersRemainFailClosed',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),a=asset(f),digest=(kind:string,parts:unknown[])=>createHmac('sha256',key).update(JSON.stringify([a.workspaceId,a.platform,a.appId,a.providerAssetId,kind,...parts])).digest('hex');
 const row=await f.db.metaInboxDeletionRequest.create({data:{workspaceId:a.workspaceId,platform:a.platform,appId:a.appId,subjectKind:'item',subjectHash:digest('item',['comments','legacy-id',1]),requestKey:digest('request',['item','comments','legacy-id',1]),reason:'verified_content_deletion',confirmationCode:'l'.repeat(43),targetEncrypted:encryptToken(JSON.stringify({asset:a,kind:'item',eventKind:'comments',subjectId:'legacy-id',phase:'pending'}))}});
 let done=false;for(let i=0;i<8&&!done;i++)done=(await d.purgeSources(row.confirmationCode,2)).sourcesComplete;assert.equal(done,true);assert.equal(await d.status(row.confirmationCode),'pending');
 await f.db.metaInboxDeletionMarker.create({data:{workspaceId:a.workspaceId,platform:a.platform,appId:a.appId,subjectKind:'asset',subjectHash:digest('asset',['version',1])}});
 const next=await recreate(f);assert.equal(await f.db.$transaction(tx=>d.isDeleted(tx,{...next,actorId:'301',providerEventId:'unknown-legacy-epoch',eventKind:'messages',occurredAt:new Date()})),true,'do not guess or discard an ambiguous old marker');
}));
