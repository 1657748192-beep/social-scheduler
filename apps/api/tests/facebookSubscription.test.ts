import assert from 'node:assert/strict';
import test from 'node:test';
import { createFacebookSubscriptionService } from '../src/services/facebookSubscriptionService';
test('subscriptionNeedsActualGrantAndPreservesExistingFields',async()=>{
  let granted=false,writes=0,fields=['mention'],saved:string[]=[];
  const service=createFacebookSubscriptionService({withAccount:async(_id,run)=>run({pageId:'100',accessToken:'token',otherBindings:0,ownedFields:[],
    saveOwnedFields:async value=>{saved=value;},savePendingRelease:async()=>{},clearPendingRelease:async()=>{}}),
    createClient:()=>({inspectCapabilities:async()=>({subscription:{status:granted?'available':'missing'}}),getSubscribedFields:async()=>fields,
      subscribe:async(value)=>{writes++;fields=value;return true;},unsubscribe:async()=>true})});
  assert.equal((await service.ensure('account')).status,'missing');assert.equal(writes,0);
  granted=true;assert.equal((await service.ensure('account')).status,'available');assert.deepEqual(fields,['mention','feed','messages']);assert.deepEqual(saved,['feed','messages']);
});
test('sharedPageDisconnectAndFailedReleaseRemainLocalSafe',async()=>{
  let otherBindings=1,remoteCalls=0,pending=false;
  const service=createFacebookSubscriptionService({withAccount:async(_id,run)=>run({pageId:'100',accessToken:'token',otherBindings,ownedFields:['feed','messages'],
    saveOwnedFields:async()=>{},savePendingRelease:async()=>{pending=true;},clearPendingRelease:async()=>{pending=false;}}),
    createClient:()=>({inspectCapabilities:async()=>({subscription:{status:'available'}}),getSubscribedFields:async()=>['feed','messages'],subscribe:async()=>true,
      unsubscribe:async()=>{remoteCalls++;throw new Error('temporary');}})});
  await service.release('account');assert.equal(remoteCalls,0);assert.equal(pending,false);
  otherBindings=0;await service.release('account');assert.equal(remoteCalls,1);assert.equal(pending,true);
});
test('releaseDoesNotRemoveSubscriptionsThatPredateFeature',async()=>{
  let calls=0;
  const service=createFacebookSubscriptionService({withAccount:async(_id,run)=>run({pageId:'100',accessToken:'token',otherBindings:0,ownedFields:[],
    saveOwnedFields:async()=>{},savePendingRelease:async()=>{},clearPendingRelease:async()=>{}}),
    createClient:()=>({inspectCapabilities:async()=>({subscription:{status:'available'}}),getSubscribedFields:async()=>['feed','messages'],subscribe:async()=>{calls++;return true;},unsubscribe:async()=>{calls++;return true;}})});
  await service.release('account');assert.equal(calls,0);
});
