import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {withInboxFixture} from './helpers/interactionInboxFixture';import {inboxTestAccess} from './helpers/interactionInboxServices';import {createFacebookSendExecutor} from '../src/facebookManagement/sendAttempts';
test('lostAcknowledgementNeverDuplicatesFacebookSend',async()=>withInboxFixture(async f=>{
 const m=await import('../src/interactionInbox/sends').catch(()=>null);assert.ok(m,'targeted reply service required');const c=await f.seedVerifiedCase(),access=inboxTestAccess(f),executor=createFacebookSendExecutor({db:f.db});let sends=0;
 const adapter:any={reply:async(a:any,s:any,text:string,requestKey:string)=>executor.executeFacebookSend({...a.ctx,managedPageId:a.sourceRef.managedPageId},{requestKey,targetId:s.participantId,kind:'message',text},async()=>{sends++;throw Error('provider acknowledgement lost');})};
 const registry:any={getInboxAdapter:()=>adapter},s=m.createInboxSends({db:f.db,access,registry}),key=randomUUID(),input={targetId:'thread-300',text:'synthetic reply',requestKey:key},before=await f.protectedSnapshot();
 assert.equal((await s.replyToCase(f.adminCtx,c.id,input)).status,'unknown');assert.equal((await s.replyToCase(f.adminCtx,c.id,input)).status,'unknown');assert.equal(sends,1);
 await assert.rejects(s.replyToCase(f.adminCtx,c.id,{...input,requestKey:randomUUID()}),(e:any)=>e.statusCode===409);assert.equal(sends,1);
 await assert.rejects(s.replyToCase(f.adminCtx,c.id,{...input,text:'changed'}));await assert.rejects(s.replyToCase(f.adminCtx,c.id,{...input,targetId:'other-thread'}));await assert.rejects(s.replyToCase(f.adminCtx,c.id,{...input,text:'x'.repeat(2001)}));
 assert.equal((await f.db.interactionCase.findUniqueOrThrow({where:{id:c.id}})).status,'pending');
 await f.db.facebookManagementPageSelection.deleteMany({where:{workspaceId:c.workspaceId}});await assert.rejects(s.replyToCase(f.adminCtx,c.id,{...input,requestKey:randomUUID()}));assert.equal(sends,1);assert.deepEqual(await f.protectedSnapshot(),before);
}));
