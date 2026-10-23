import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {withMetaInboxFixture} from './helpers/metaInboxFixture';
test('REC3 database constraints reject duplicate identities, reused attempts and invalid or reopened states',async()=>withMetaInboxFixture(async f=>{
 const model=(f.db as any).instagramReplyRecordingGrant;assert.ok(model,'persistent REC3 grant model required');
 const before=await f.publishingSnapshot(),at=new Date();
 const data={workspaceId:f.adminCtx.workspaceId,appId:'456',providerAccountId:'100',incomingKey:'a'.repeat(64),accountId:f.instagramAccountIds[0],userId:f.adminCtx.userId,connectionId:f.instagramConnectionIds[0],connectionVersion:1,sourceRecordId:randomUUID(),providerEventId:'incoming-rec3',actorId:'300',conversationId:'thread',occurredAt:at,predecessorAttemptId:randomUUID(),predecessorProviderId:'previous',marker:'SS-IG-DM-1023-REC3',payloadHash:'b'.repeat(64),expiresAt:new Date(+at+60000),forgetAfter:new Date(+at+86400000)};
 const row=await model.create({data});await assert.rejects(model.create({data}), (e:any)=>e.code==='P2002');
 await assert.rejects(model.update({where:{id:row.id},data:{actorId:'999'}}));
 for(const patch of [{state:'wrong'},{state:'claimed'},{state:'available',attemptId:randomUUID(),claimedAt:at}])await assert.rejects(model.create({data:{...data,incomingKey:randomUUID().replaceAll('-','').repeat(2),...patch}}));
 const attemptId=randomUUID();await model.update({where:{id:row.id},data:{state:'claimed',attemptId,claimedAt:at}});
 await assert.rejects(model.create({data:{...data,incomingKey:'c'.repeat(64),state:'claimed',attemptId,claimedAt:at}}),(e:any)=>e.code==='P2002');
 await assert.rejects(model.update({where:{id:row.id},data:{attemptId:randomUUID()}}));
 await model.update({where:{id:row.id},data:{state:'closed',attemptId:null}});
 await assert.rejects(model.update({where:{id:row.id},data:{state:'available',claimedAt:null}}));
 await assert.rejects(model.update({where:{id:row.id},data:{incomingKey:'d'.repeat(64)}}));
 assert.deepEqual(await f.publishingSnapshot(),before);
 await model.deleteMany({where:{workspaceId:f.adminCtx.workspaceId}});
}));
