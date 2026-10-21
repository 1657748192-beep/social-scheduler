import test from 'node:test';import assert from 'node:assert/strict';import {createHash,createHmac,randomUUID} from 'node:crypto';import {deriveMetaDeletionKey} from '../src/utils/tokenCrypto';
import {withInboxFixture} from './helpers/interactionInboxFixture';import {inboxTestAccess,inboxTestPolicy} from './helpers/interactionInboxServices';import {createFacebookInboxAdapter} from '../src/interactionInbox/adapters/facebook';import {presentInboxCase} from '../src/interactionInbox/cases';
test('comment detail includes page replies with outgoing direction and does not persist bodies',async()=>withInboxFixture(async f=>{
 const a=await inboxTestAccess(f).resolveInboxAsset(f.adminCtx,f.accountIds[0],'comments.read'),now=new Date().toISOString(),parent={id:'c1',postId:'100_200',text:'Question',timestamp:now,senderId:'300'},reply={id:'r1',parentId:'c1',postId:'100_200',text:'Page reply',timestamp:now,senderId:'100'};
 const adapter=createFacebookInboxAdapter({db:f.db,policy:inboxTestPolicy(f),engagement:{comments:async()=>({items:[],nextCursor:null}),commentReplies:async()=>({parent,items:[reply],nextCursor:null}),capabilities:async()=>({})} as any});const before=await f.protectedSnapshot();
 const source={...a.sourceRef!,scheduleId:randomUUID(),postId:'100_200',commentId:'c1'},detail=await adapter.detail(a,source);assert.deepEqual(detail.items.map(x=>[x.id,x.inbound]),[['c1',true],['r1',false]]);assert.deepEqual(await f.protectedSnapshot(),before);
 const subjectHash=createHmac('sha256',deriveMetaDeletionKey()).update(JSON.stringify([f.adminCtx.workspaceId,'facebook','123','100','item','comments','r1'])).digest('hex');await f.db.metaInboxDeletionMarker.create({data:{workspaceId:f.adminCtx.workspaceId,platform:'facebook',appId:'123',subjectKind:'item',subjectHash}});
 assert.deepEqual((await adapter.detail(a,source)).items.map(x=>x.id),['c1']);
}));
test('replied badge needs current scoped successful receipt, not unknown or another target',async()=>withInboxFixture(async f=>{
 const c=await f.seedVerifiedCase(0,'300'),source={platform:'facebook',managedPageId:f.pages[0].id,connectionId:f.connections[0].id,connectionVersion:1,commentId:'c1'};await f.db.interactionCase.update({where:{id:c.id},data:{kind:'comments',sourceRef:source}});
 assert.equal((await presentInboxCase(f.db,f.adminCtx,c.id,f.accountIds[0]) as any).replied,false);
 const attempt=await f.db.facebookInteractionSendAttempt.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,requestKey:randomUUID(),targetHash:createHash('sha256').update(JSON.stringify(['comment','c1'])).digest('hex'),payloadHash:'synthetic',status:'unknown'}});
 assert.equal((await presentInboxCase(f.db,f.adminCtx,c.id,f.accountIds[0]) as any).replied,false);await f.db.facebookInteractionSendAttempt.update({where:{id:attempt.id},data:{status:'sent',providerId:'r1'}});
 assert.equal((await presentInboxCase(f.db,f.adminCtx,c.id,f.accountIds[0]) as any).replied,true);assert.equal((await f.db.interactionCase.findUniqueOrThrow({where:{id:c.id}})).status,'pending');
}));

test('missing optional author is outgoing only when exact current parent send receipt verifies it',async()=>withInboxFixture(async f=>{
 const a=await inboxTestAccess(f).resolveInboxAsset(f.adminCtx,f.accountIds[0],'comments.read'),now=new Date().toISOString(),parent={id:'c1',postId:'100_200',text:'Question',timestamp:now,senderId:'300'},reply={id:'r1',parentId:'c1',postId:'100_200',text:'Page reply',timestamp:now};
 await f.db.facebookInteractionSendAttempt.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,requestKey:randomUUID(),targetHash:createHash('sha256').update(JSON.stringify(['comment','c1'])).digest('hex'),payloadHash:'synthetic',status:'sent',providerId:'r1'}});
 const adapter=createFacebookInboxAdapter({db:f.db,policy:inboxTestPolicy(f),engagement:{commentReplies:async()=>({parent,items:[reply],nextCursor:null}),capabilities:async()=>({})} as any});
 const detail=await adapter.detail(a,{...a.sourceRef!,scheduleId:randomUUID(),postId:'100_200',commentId:'c1'});assert.equal(detail.items.find(x=>x.id==='r1')?.inbound,false);
}));
