import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {seedDeletionCustomer} from './helpers/metaInboxDeletionFixture';
import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
import {releaseDrainedInstagramConnections} from '../src/instagramManagement/accountRemoval';

test('accountRemovalCannotCascadeAwayPendingCustomerDeletionProvenance',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),before=await f.publishingSnapshot(),d=createMetaInboxDeletion({db:f.db,encrypt:encryptToken,decrypt:decryptToken});
 const receipt=await d.disconnect({workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1});
 await assert.rejects(f.db.socialAccount.delete({where:{id:f.instagramAccountIds[0]}}));
 const account=await f.db.socialAccount.findUniqueOrThrow({where:{id:f.instagramAccountIds[0]}});
 await assert.rejects(f.db.$transaction(tx=>releaseDrainedInstagramConnections(tx,account)),(e:any)=>e.statusCode===409);
 assert.ok(await f.db.interactionIdentity.findUnique({where:{id:own.identity.id}}));
 for(let i=0;i<60&&await d.status(receipt.confirmationCode)!=='completed';i++){const s=await d.purgeSources(receipt.confirmationCode,50);if(s.sourcesComplete)await d.purgeDerived(receipt.confirmationCode,50);}
 assert.equal(await d.status(receipt.confirmationCode),'completed');assert.equal(await f.db.customerNote.findUnique({where:{id:own.note.id}}),null);assert.equal(await f.db.interactionCustomerTag.count({where:{customerId:own.customer.id}}),0);assert.deepEqual(await f.publishingSnapshot(),before);
 await f.db.$transaction(async tx=>{await releaseDrainedInstagramConnections(tx,account);await tx.socialAccount.delete({where:{id:account.id}});});
 assert.equal(await f.db.socialAccount.findUnique({where:{id:account.id}}),null);
}));
