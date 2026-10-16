import assert from 'node:assert/strict';
import test from 'node:test';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
import {createFacebookSubscriptionService} from '../src/facebookManagement/subscriptions';
import {createFacebookPageAccess} from '../src/facebookManagement/access';
import {createFacebookManagementStore} from '../src/facebookManagement/store';
test('sharedSubscriptionPreservesFieldsAndDisconnectNeverUnsubscribes',async()=>withFacebookManagementFixture(async({db,contexts,pages,connections,scopes,snapshot}:any)=>{
  const before=await snapshot();await db.facebookManagedPage.updateMany({where:{id:{in:pages.map((p:any)=>p.id)}},data:{notificationsEnabled:false}});
  const access=createFacebookPageAccess({db,decrypt:v=>v,inspect:async id=>({pageId:id,scopes,granularScopes:[],expiresAt:null})});
  let posts=0,deletes=0,fields=['mention'];
  const service=createFacebookSubscriptionService({db,appId:'123',resolvePageAccess:access.resolvePageAccess,createClient:()=>({getSubscribedFields:async()=>fields,subscribe:async(next:string[])=>{posts++;fields=[...next];return true;},unsubscribe:async()=>{deletes++;return true;}})});
  assert.equal((await service.status(contexts[0])).subscription,'missing');assert.equal(posts,0);
  assert.equal(await db.facebookManagementSubscription.count({where:{appId:'123',pageId:'100'}}),0);
  await Promise.all(contexts.map((ctx:any)=>service.enableNotifications(ctx)));
  assert.equal(posts,1);assert.deepEqual([...fields].sort(),['feed','mention','messages']);
  assert.equal(await db.facebookManagementSubscription.count({where:{appId:'123',pageId:'100'}}),1);
  assert.ok((await db.facebookManagedPage.findMany({where:{id:{in:pages.map((p:any)=>p.id)}}})).every((p:any)=>p.notificationsEnabled));
  await createFacebookManagementStore(db,v=>v).disconnect(contexts[0],connections[0].id);
  assert.equal((await db.facebookManagedPage.findUniqueOrThrow({where:{id:pages[1].id}})).notificationsEnabled,true);
  assert.equal(posts,1);assert.equal(deletes,0);assert.deepEqual(await snapshot(),before);
  await db.facebookManagementSubscription.deleteMany({where:{appId:'123',pageId:'100'}});
}));
test('missingPageTasksNeverAttemptSubscriptionWrites',async()=>withFacebookManagementFixture(async({db,contexts,pages,scopes}:any)=>{
  const access=createFacebookPageAccess({db,decrypt:v=>v,inspect:async id=>({pageId:id,scopes,granularScopes:[],expiresAt:null})});
  let posts=0;
  const service=createFacebookSubscriptionService({db,appId:'123',resolvePageAccess:access.resolvePageAccess,createClient:()=>({getSubscribedFields:async()=>[],subscribe:async()=>{posts++;return true;}})});
  await db.facebookManagedPage.update({where:{id:pages[0].id},data:{tasks:['MESSAGING']}});
  await assert.rejects(service.enableNotifications(contexts[0]));assert.equal(posts,0);
}));
