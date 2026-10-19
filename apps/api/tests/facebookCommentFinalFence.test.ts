import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {createFacebookManagementEngagement} from '../src/facebookManagement/engagement';

function scenario(){
 const userId=randomUUID(),workspaceId=randomUUID(),managedPageId=randomUUID(),connectionId=randomUUID(),scheduleId=randomUUID();let revoked=false,identities=0,reads=0,sends=0;
 const text='Synthetic controlled reply',rule={kind:'comment' as const,userId,workspaceId,managedPageId,connectionId,connectionVersion:1,appId:'123',pageId:'100',scheduleId,postId:'100_201',commentId:'200_1',textSha256:createHash('sha256').update(text).digest('hex'),expiresAt:new Date(Date.now()+3600000).toISOString()};
 const access={managedPageId,connectionId,connectionVersion:1,appId:'123',pageId:'100',pageToken:'synthetic',tasks:['MODERATE'],scopes:['pages_read_engagement','pages_read_user_content','pages_manage_engagement'],role:'owner' as const,publishingAccountId:'account'};
 const api={getPostIdentity:async()=>{identities++;return{id:'100_201',pageId:'100',sourceId:'200'};},listComments:async(postId:string)=>{reads++;return{items:[{id:'200_1',postId,text:'test',timestamp:new Date().toISOString()}],nextCursor:null};},replyComment:async()=>{sends++;return{status:'sent' as const,providerId:'one-reply'};}};
 const db={schedule:{findFirst:async()=>({id:scheduleId,workspaceId,postVariant:{platform:'facebook',socialAccountId:'account',post:{workspaceId}},publishJobs:[{providerPostId:'200'}]})}};
 const service=createFacebookManagementEngagement({db:db as any,testRestriction:rule,resolvePageAccess:async()=>{if(revoked)throw Error('revoked');return access;},executeFacebookSend:async(_c,_i,send)=>send(),createClient:()=>api as any});
 return{ctx:{userId,workspaceId,managedPageId,sessionId:randomUUID()},rule,text,api,service,revoke:()=>{revoked=true;},identities:()=>identities,reads:()=>reads,sends:()=>sends};
}

test('restrictedAvailabilityCannotReadAnotherStoryEvenThroughSameSchedule',async()=>{
 const f=scenario();f.api.getPostIdentity=async()=>({id:'100_999',pageId:'100',sourceId:'200'});
 assert.equal((await f.service.postAvailability(f.ctx,f.rule.scheduleId)).status,'identity_unverified');assert.equal(f.reads(),0);
});

test('historicCommentReplyRechecksRevocationAfterFinalPhotoResolution',async()=>{
 const f=scenario();let identities=0;f.api.getPostIdentity=async()=>{if(++identities===2)f.revoke();return{id:'100_201',pageId:'100',sourceId:'200'};};
 try{const result=await f.service.replyComment(f.ctx,{scheduleId:f.rule.scheduleId,commentId:f.rule.commentId,text:f.text,requestKey:randomUUID()});assert.notEqual(result.status,'sent');}catch{}
 assert.equal(f.sends(),0);
});

test('unifiedCommentRefreshEnumeratesOnlyTheControlledSchedule',async()=>{
 process.env.DATABASE_URL??='postgresql://synthetic:synthetic@127.0.0.1:1/synthetic_test';process.env.REDIS_URL??='redis://127.0.0.1:1';process.env.JWT_SECRET??='synthetic-only-not-a-secret';
 const {createFacebookInboxAdapter}=await import('../src/interactionInbox/adapters/facebook');
 const f=scenario(),other=randomUUID(),row=(id:string)=>({id,publishJobs:[{providerPostId:'200'}]});
 const db={schedule:{findMany:async({where}:any)=>where.id===f.rule.scheduleId?[row(f.rule.scheduleId)]:[row(other),row(f.rule.scheduleId)]}};
 const engagement={commentReadScheduleId:f.rule.scheduleId,comments:async(_ctx:any,id:string)=>{assert.equal(id,f.rule.scheduleId);return{items:[{id:'200_1',postId:'100_201',text:'controlled',timestamp:new Date().toISOString()}],nextCursor:null};}};
 const adapter=createFacebookInboxAdapter({db:db as any,engagement:engagement as any});
 const asset={platform:'facebook',ctx:f.ctx,accountId:'account',canonicalKey:'selected-asset',connectionVersion:1,sourceRef:{platform:'facebook',managedPageId:f.ctx.managedPageId,connectionId:f.rule.connectionId,connectionVersion:1}};
 const page=await adapter.list(asset as any,'comments',null,25);assert.equal(page.items.length,1);assert.equal(page.items[0].sourceRef.scheduleId,f.rule.scheduleId);
});
