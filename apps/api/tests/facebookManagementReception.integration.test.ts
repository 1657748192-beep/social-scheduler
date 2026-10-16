import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,createHmac} from 'node:crypto';
import express from 'express';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
import {createFacebookManagementReceptionStore} from '../src/facebookManagement/receptionStore';
import {createFacebookManagementStore} from '../src/facebookManagement/store';
import {createFacebookWebhookRouter} from '../src/routes/facebookWebhookRoutes';
import type {FacebookReceivedEventInput} from '../src/services/facebookWebhookService';
import {errorHandler} from '../src/middleware/errorHandler';
import {startFacebookManagementHttp} from './helpers/facebookManagementHttp';

test('signedEventsPersistBeforeAckAndRecoverAfterCrash',async()=>withFacebookManagementFixture(async({db,pages,databaseNow}:any)=>{
  const store=createFacebookManagementReceptionStore({db,appId:'123'}),now=await databaseNow();
  const event:FacebookReceivedEventInput={pageId:'100',eventKey:'comment-add',kind:'comment',providerId:'100_10',postId:'100_1',text:'Comment',occurredAt:now.toISOString()};
  await Promise.all([store.enqueue([event]),store.enqueue([event])]);assert.equal(await db.facebookInteractionEvent.count({where:{managedPageId:{in:pages.map((p:any)=>p.id)}}}),2);
  const first=await store.claimBatch(await databaseNow(),50);assert.equal(first.length,2);
  const later=new Date(now.getTime()+62000),reclaimed=await store.claimBatch(later,50);assert.equal(reclaimed.length,2);
  assert.equal(await store.finishClaim(first[0].id,first[0].claimToken),false);
  for(const row of reclaimed){await store.processClaim(row,later);await store.finishClaim(row.id,row.claimToken);}
  assert.equal(await db.facebookInteractionComment.count({where:{managedPageId:{in:pages.map((p:any)=>p.id)}}}),2);
  async function drain(){for(const row of await store.claimBatch(later,50)){await store.processClaim(row,later);await store.finishClaim(row.id,row.claimToken);}}
  await store.enqueue([{...event,eventKey:'delete',deleted:true,text:undefined,occurredAt:new Date(now.getTime()+1000).toISOString()}]);await drain();
  await store.enqueue([{...event,eventKey:'late-edit',text:'Must not resurrect',occurredAt:new Date(now.getTime()+2000).toISOString()}]);await drain();
  assert.ok((await db.facebookInteractionComment.findMany({where:{managedPageId:{in:pages.map((p:any)=>p.id)}}})).every((c:any)=>c.deleted&&c.text===null));
  let unavailable=false;
  const app=express();app.use('/webhook',createFacebookWebhookRouter({enabled:()=>true,appSecret:'test-secret',verifyToken:'verify',onEvents:async events=>{if(unavailable)throw Error('database unavailable');await store.enqueue(events);}}));app.use(express.json());app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();assert.ok(address&&typeof address!=='string');
  const endpoint=`http://127.0.0.1:${address.port}/webhook`;
  const body=JSON.stringify({object:'page',entry:[{id:'100',messaging:[{sender:{id:'300'},recipient:{id:'100'},timestamp:now.getTime(),message:{mid:'m-signed',text:'Signed'}}]}]});
  const signed=(text:string)=>`sha256=${createHmac('sha256','test-secret').update(text).digest('hex')}`;
  try{
    assert.equal((await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','X-Hub-Signature-256':'sha256='+'0'.repeat(64)},body})).status,403);
    unavailable=true;assert.equal((await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','X-Hub-Signature-256':signed(body)},body})).status,503);
    unavailable=false;assert.equal((await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','X-Hub-Signature-256':signed(body)},body})).status,200);
    assert.equal(await db.facebookInteractionEvent.count({where:{eventKey:'message:m-signed',managedPageId:{in:pages.map((p:any)=>p.id)}}}),2);
    const oversized='a'.repeat(1048577);assert.equal((await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','X-Hub-Signature-256':signed(oversized)},body:oversized})).status,413);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
}));

test('disconnectStopsLateDeliveryAndPrunesOnlyNewNinetyDayData',async()=>withFacebookManagementFixture(async({db,contexts,pages,connections,legacy,snapshot,databaseNow}:any)=>{
  const store=createFacebookManagementReceptionStore({db,appId:'123'}),before=await snapshot(),now=await databaseNow();
  const event:FacebookReceivedEventInput={pageId:'100',eventKey:'message:one',kind:'message',providerId:'m1',senderId:'300',recipientId:'100',text:'Inbound',isEcho:false,occurredAt:now.toISOString()};
  async function drain(){const time=await databaseNow();for(const row of await store.claimBatch(time,50)){await store.processClaim(row,time);await store.finishClaim(row.id,row.claimToken);}}
  await store.enqueue([event]);await drain();assert.equal((await store.latestInbound(pages[0].id,'300'))?.toISOString(),now.toISOString());
  await store.enqueue([{...event,eventKey:'echo',providerId:'echo',isEcho:true,senderId:'100',recipientId:'300'}]);await drain();assert.equal((await store.latestInbound(pages[0].id,'300'))?.toISOString(),now.toISOString());
  await createFacebookManagementStore(db,v=>v).disconnect(contexts[0],connections[0].id);
  await store.enqueue([{...event,eventKey:'late',providerId:'late'}]);await drain();
  assert.equal(await db.facebookInteractionMessage.count({where:{managedPageId:pages[0].id,providerId:'late'}}),0);assert.equal(await db.facebookInteractionMessage.count({where:{managedPageId:pages[1].id,providerId:'late'}}),1);
  assert.equal((await db.facebookReceivedEvent.findUniqueOrThrow({where:{id:legacy.id}})).status,'pending');
  const old=new Date(now.getTime()-91*86400000);
  await db.facebookInteractionMessage.updateMany({where:{managedPageId:{in:pages.map((p:any)=>p.id)},providerId:'m1'},data:{receivedAt:old}});
  await db.facebookInteractionSendAttempt.create({data:{managedPageId:pages[1].id,requestKey:randomUUID(),payloadHash:'hash',status:'unknown',createdAt:old}});
  await db.facebookInteractionSendAttempt.create({data:{managedPageId:pages[1].id,requestKey:randomUUID(),payloadHash:'recent',status:'unknown'}});
  await db.facebookInteractionComment.create({data:{managedPageId:pages[1].id,providerId:'old-comment',postId:'100_1',text:'Old',occurredAt:old,receivedAt:old}});
  await db.facebookInteractionComment.create({data:{managedPageId:pages[1].id,providerId:'recent-comment',postId:'100_1',text:'Recent',occurredAt:now}});
  await db.facebookInteractionEvent.updateMany({where:{managedPageId:{in:pages.map((p:any)=>p.id)},eventKey:'message:one'},data:{receivedAt:old}});
  const expiredState=await db.facebookManagementOAuthState.create({data:{appId:'123',state:randomUUID(),...{userId:contexts[1].userId,workspaceId:contexts[1].workspaceId,sessionId:contexts[1].sessionId},callbackUrl:'https://example.test/callback',expiresAt:old}});
  const empty=await db.facebookInteractionThread.create({data:{managedPageId:pages[1].id,participantId:'999',receivedAt:old,updatedAt:old}});
  await db.facebookReceivedEvent.update({where:{id:legacy.id},data:{receivedAt:old}});
  await store.prune(now);
  assert.equal(await db.facebookInteractionMessage.count({where:{managedPageId:{in:pages.map((p:any)=>p.id)},providerId:'m1'}}),0);
  assert.equal(await db.facebookInteractionMessage.count({where:{managedPageId:pages[1].id,providerId:'late'}}),1);
  assert.equal(await db.facebookInteractionSendAttempt.count({where:{managedPageId:pages[1].id}}),1);
  assert.equal(await db.facebookInteractionComment.count({where:{managedPageId:pages[1].id,providerId:'old-comment'}}),0);assert.equal(await db.facebookInteractionComment.count({where:{managedPageId:pages[1].id,providerId:'recent-comment'}}),1);
  assert.equal(await db.facebookInteractionEvent.count({where:{managedPageId:{in:pages.map((p:any)=>p.id)},eventKey:'message:one'}}),0);
  assert.equal(await db.facebookManagementOAuthState.findUnique({where:{id:expiredState.id}}),null);assert.equal(await db.facebookInteractionThread.findUnique({where:{id:empty.id}}),null);
  assert.ok(await db.facebookReceivedEvent.findUnique({where:{id:legacy.id}}));assert.deepEqual(await snapshot(),before);
}));

test('claimBatchIsLimitedToFiftyAndConcurrentConsumersDoNotOverlap',async()=>withFacebookManagementFixture(async({db,pages,databaseNow}:any)=>{
  const store=createFacebookManagementReceptionStore({db,appId:'123'}),now=await databaseNow();
  await store.enqueue(Array.from({length:28},(_,i)=>({pageId:'100',eventKey:`bounded-${i}`,kind:'message' as const,providerId:`m-${i}`,senderId:'300',recipientId:'100',occurredAt:now.toISOString()})));
  const time=await databaseNow(),results=await Promise.all([store.claimBatch(time,999),store.claimBatch(time,999)]);
  assert.equal(results.flat().length,56);assert.equal(new Set(results.flat().map(row=>row.id)).size,56);assert.ok(results.every(rows=>rows.length<=50));
  assert.equal(await db.facebookInteractionEvent.count({where:{managedPageId:{in:pages.map((p:any)=>p.id)},status:'processing'}}),56);
}));

test('eventRetriesBackOffAndStopAfterEightClaims',async()=>withFacebookManagementFixture(async({db,pages,databaseNow}:any)=>{
  const store=createFacebookManagementReceptionStore({db,appId:'123'}),now=await databaseNow();
  await db.facebookManagedPage.updateMany({where:{id:pages[1].id},data:{notificationsEnabled:false}});
  await store.enqueue([{pageId:'100',eventKey:'bad-comment',kind:'comment',providerId:'100_99',occurredAt:now.toISOString()}]);
  let time=await databaseNow();
  for(let i=1;i<=8;i++){
    const rows=await store.claimBatch(time,50);assert.equal(rows.length,1);await assert.rejects(store.processClaim(rows[0],time));
    const before=Date.now();await store.failClaim(rows[0].id,rows[0].claimToken);
    const row=await db.facebookInteractionEvent.findUniqueOrThrow({where:{id:rows[0].id}});assert.equal(row.attempts,i);
    if(i===1)assert.ok(row.availableAt.getTime()-before>=4900);
    assert.ok(row.availableAt.getTime()-before<=3600000+1000);
    if(i===8)assert.equal(row.status,'dead');time=new Date(row.availableAt.getTime()+1);
  }
  assert.equal((await store.claimBatch(new Date(time.getTime()+7200000),50)).length,0);
}));

test('applicationMountsFacebookRawBodyBeforeJsonAndRetirementButKeepsInstagramRetired',async()=>withFacebookManagementFixture(async({db,pages,databaseNow}:any)=>{
  const http=await startFacebookManagementHttp(),origin=http.origin,now=await databaseNow();
  try{
    assert.equal((await fetch(origin+'/api/v1/webhooks/facebook?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=challenge')).status,200);
    const body=JSON.stringify({object:'page',entry:[{id:'100',messaging:[{sender:{id:'300'},recipient:{id:'100'},timestamp:now.getTime(),message:{mid:'m-mounted',text:'Fixture message'}}]}]});
    const response=await fetch(origin+'/api/v1/webhooks/facebook',{method:'POST',headers:{'content-type':'application/json','X-Hub-Signature-256':`sha256=${createHmac('sha256','test-secret').update(body).digest('hex')}`},body});
    assert.equal(response.status,200);assert.equal(await db.facebookInteractionEvent.count({where:{eventKey:'message:m-mounted',managedPageId:{in:pages.map((p:any)=>p.id)}}}),2);
    assert.equal((await fetch(origin+'/api/v1/webhooks/instagram',{method:'POST'})).status,410);
    assert.equal((await fetch(origin+'/api/v1/integrations/facebook-engagement/oauth/callback')).status,410);
  }finally{await http.stop();}
}));
