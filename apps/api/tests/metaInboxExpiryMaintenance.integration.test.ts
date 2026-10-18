import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {seedDeletionCustomer} from './helpers/metaInboxDeletionFixture';
import {createMetaExpiryMaintenance} from '../src/interactionInbox/expiryMaintenance';import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';

test('expiryMaintenanceRotatesSourcesAndBodyPhasesWithinItsConfiguredApp',async()=>withMetaInboxFixture(async f=>{
 const now=new Date(),old=new Date(now.getTime()-91*86400000),before=await f.publishingSnapshot(),connectionId=f.instagramConnectionIds[0],workspaceId=f.adminCtx.workspaceId;
 const other=await f.db.instagramManagementConnection.create({data:{workspaceId,userId:f.userId,appId:'457',providerAccountId:'100',providerUserId:'200'}});
 for(const id of [connectionId,other.id])await f.db.instagramInteractionEvent.create({data:{workspaceId,connectionId:id,connectionVersion:1,eventKey:'expired',payload:{synthetic:true},receivedAt:old}});
 await f.db.instagramInteractionMessage.create({data:{workspaceId,connectionId,connectionVersion:1,providerId:'expired',conversationId:'thread',actorId:'300',inbound:true,text:'Synthetic expired',occurredAt:old,receivedAt:old}});
 const maintenance=createMetaExpiryMaintenance({db:f.db,policy:createLiveInboxPolicy([]),namespaces:[{platform:'instagram',appId:'456'}],now:()=>now});
 for(let i=0;i<15;i++)assert.ok(await maintenance.tick()<=50);
 assert.equal(await f.db.instagramInteractionEvent.count({where:{connectionId}}),0);assert.equal(await f.db.instagramInteractionMessage.count({where:{connectionId}}),0);assert.equal(await f.db.instagramInteractionEvent.count({where:{connectionId:other.id}}),1);assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('ordinaryExpiryDoesNotRaceAnActiveDeletionJobThroughItsCasePointer',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),d=createMetaInboxDeletion({db:f.db,encrypt:encryptToken,decrypt:decryptToken});await d.disconnect({workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1});
 await f.db.instagramInteractionMessage.deleteMany({where:{connectionId:f.instagramConnectionIds[0]}});await f.db.instagramInteractionComment.deleteMany({where:{connectionId:f.instagramConnectionIds[0]}});
 const maintenance=createMetaExpiryMaintenance({db:f.db,policy:createLiveInboxPolicy([]),namespaces:[{platform:'instagram',appId:'456'}]});for(let i=0;i<8;i++)await maintenance.tick();
 assert.equal(await f.db.interactionCase.count({where:{id:{in:own.cases.map(v=>v.id)}}}),2);assert.ok(await f.db.interactionIdentity.findUnique({where:{id:own.identity.id}}));
}));
