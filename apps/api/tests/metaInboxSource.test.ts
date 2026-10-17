import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInboxSource} from '../src/interactionInbox/source';
import {inboxSourceAlive} from '../src/interactionInbox/sourceLifetime';
import {createFacebookInboxAdapter} from '../src/interactionInbox/adapters/facebook';
const connectionId='11111111-1111-4111-8111-111111111111',accountId='22222222-2222-4222-8222-222222222222';
const fb={managedPageId:accountId,connectionId,connectionVersion:1,conversationId:'thread-1'};
test('legacyFacebookSourceRequiresFacebookContext',()=>{
 assert.deepEqual(parseInboxSource(fb,'facebook'),{...fb,platform:'facebook'});
 assert.throws(()=>parseInboxSource(fb,'instagram'));
 assert.throws(()=>parseInboxSource({...fb,platform:'instagram'},'facebook'));
});
test('instagramCannotParseFacebookFields',()=>{
 const ig={platform:'instagram',instagramAccountId:accountId,connectionId,connectionVersion:1,mediaId:'media-1',commentId:'comment-1'};
 assert.deepEqual(parseInboxSource(ig,'instagram'),ig);
 assert.throws(()=>parseInboxSource({...ig,managedPageId:accountId},'instagram'));
 assert.throws(()=>parseInboxSource({...ig,postId:'facebook-post'},'instagram'));
 assert.throws(()=>parseInboxSource(ig,'facebook'));
});
test('sourceRejectsUnknownFieldsEmptyProviderIdsAndInvalidVersions',()=>{
 for(const patch of [{connectionVersion:0},{connectionVersion:1.5},{conversationId:''},{conversationId:'a'.repeat(257)},{token:'private'},{connectionId:'not-uuid'}])assert.throws(()=>parseInboxSource({...fb,...patch},'facebook'));
});
test('instagramSourceCannotReachFacebookLifetimeLookup',async()=>{
 let calls=0;const db=new Proxy({}, {get(){calls++;throw Error('cross-platform lookup');}});
 const source=parseInboxSource({platform:'instagram',instagramAccountId:accountId,connectionId,connectionVersion:1,sourceRecordId:accountId},'instagram');
 assert.equal(await inboxSourceAlive(db as any,source,new Date()),false);
 assert.equal(calls,0);
});
test('facebookAdapterRejectsNonFacebookAssetBeforeGraph',async()=>{
 let calls=0;const adapter=createFacebookInboxAdapter({db:{} as any,engagement:{capabilities:async()=>{calls++;return{};},conversations:async()=>{calls++;return{items:[],nextCursor:null};}} as any});
 const spoof:any={platform:'instagram',sourceRef:{...fb,platform:'facebook'},ctx:{},connectionVersion:1};
 await assert.rejects(adapter.capabilities(spoof));
 await assert.rejects(adapter.list(spoof,'messages',null,25));
 assert.equal(calls,0);
});
