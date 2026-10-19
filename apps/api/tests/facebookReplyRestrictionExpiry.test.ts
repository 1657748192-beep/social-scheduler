import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {createFacebookManagementEngagement} from '../src/facebookManagement/engagement';

test('controlledReplyCannotCrossExpiryDuringFinalTokenInspection',async()=>{
 const userId=randomUUID(),workspaceId=randomUUID(),managedPageId=randomUUID(),connectionId=randomUUID();
 const start=Date.parse('2026-10-19T06:00:00Z'),expiry=start+1000;let current=start,resolutions=0,sends=0;
 const text='One controlled reply';
 const testRestriction={userId,workspaceId,managedPageId,connectionId,connectionVersion:1,appId:'123',pageId:'100',conversationId:'c1',participantId:'300',textSha256:createHash('sha256').update(text).digest('hex'),expiresAt:new Date(expiry).toISOString()};
 const service=createFacebookManagementEngagement({db:{} as any,testRestriction,now:()=>new Date(current),
  resolvePageAccess:async()=>{if(++resolutions===2)current=expiry;return{managedPageId,connectionId,connectionVersion:1,appId:'123',pageId:'100',pageToken:'synthetic',tasks:['MESSAGING'],scopes:['pages_read_engagement','pages_manage_metadata','pages_messaging'],role:'owner',publishingAccountId:randomUUID()};},
  executeFacebookSend:async(_ctx,_input,send)=>send(),
  createClient:()=>({getConversation:async()=>({id:'c1',counterpartyId:'300',updatedAt:new Date(start).toISOString()}),listMessages:async()=>({items:[{id:'inbound',conversationId:'c1',senderId:'300',recipientId:'100',inbound:true,text:'test',timestamp:new Date(start-1000).toISOString()}],nextCursor:null}),sendMessage:async()=>{sends++;return{status:'sent',providerId:'must-not-send'};}} as any),
 });
 await assert.rejects(service.replyMessage({userId,workspaceId,managedPageId,sessionId:randomUUID()},{conversationId:'c1',text,requestKey:randomUUID()}));
 assert.equal(sends,0);
});
