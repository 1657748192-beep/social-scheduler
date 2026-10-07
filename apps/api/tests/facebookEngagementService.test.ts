import assert from 'node:assert/strict';
import test from 'node:test';
import { createFacebookEngagementService } from '../src/services/facebookEngagementService';
import { createFacebookEngagementClient } from '../src/integrations/social/facebookEngagement';
const context={userId:'user',workspaceId:'workspace',socialAccountId:'account'};
function fixture(){
  let role='editor',exists=true,postId:string|null='100_200',parent='100_200',blocked=false;
  let inbound='2026-10-07T00:00:00Z',sends=0,recipient='',uncertain=false,local=false;
  const account={id:'account',workspaceId:'workspace',platform:'facebook',accountType:'page',providerAccountId:'100',status:'active',credential:{accessTokenEncrypted:'encrypted',scopes:['pages_read_engagement','pages_read_user_content','pages_manage_engagement','pages_messaging','pages_manage_metadata']}};
  const api=createFacebookEngagementClient({pageId:'100',accessToken:'token',apiVersion:'v20.0',appId:'app',appSecret:'secret',fetchImpl:(async url=>{
    const path=new URL(String(url)).pathname;
    if(path.endsWith('/debug_token'))return Response.json({data:{is_valid:true,type:'PAGE',app_id:'app',scopes:account.credential.scopes}});
    if(path.endsWith('/me'))return Response.json({id:'100'});
    if(path.endsWith('/comment'))return Response.json({id:'comment',object:{id:parent},message:'hello',created_time:inbound});
    if(path.endsWith('/thread'))return Response.json({id:'thread',updated_time:inbound,participants:{data:[{id:'100'},{id:'customer'}]}});
    if(path.endsWith('/thread/messages'))return Response.json({data:[{id:'m1',message:'hi',created_time:inbound,from:{id:'customer'},to:{data:[{id:'100'}]}}]});
    return Response.json({data:[]});
  }) as typeof fetch});
  const service=createFacebookEngagementService({enabled:()=>true,apiVersion:'v20.0',requireMembership:async()=>{if(blocked)throw new Error('forbidden');return {role};},
    getAccount:async(_w,id)=>exists && id==='account'?account:null,
    getPost:async()=>({id:'schedule',workspaceId:'workspace',status:'published',postVariant:{platform:'facebook',socialAccountId:'account'},publishJobs:[{status:'succeeded',providerPostId:postId}]}),
    decrypt:()=> 'token',createClient:()=>({...api,sendMessage:async(id)=>{sends++;recipient=id;return uncertain?{status:'unknown',diagnosticId:'diagnostic'}:{status:'sent',providerId:'mid'};}}),now:()=>new Date('2026-10-07T01:00:00Z'),
    latestInbound:async()=>local?new Date(inbound):null,
    getReceivedConversation:async(accountId,id)=>local && accountId==='account' && id==='local:thread'?{id,counterpartyId:'customer',updatedAt:inbound}:null,
    listReceivedConversations:async()=>local?[{id:'local:thread',counterpartyId:'customer',updatedAt:inbound}]:[],
    listReceivedMessages:async()=>({items:[{id:'received',conversationId:'local:thread',senderId:'customer',recipientId:'100',inbound:true,text:'hello',timestamp:inbound}],nextCursor:null})});
  return {service,account,block:()=>{blocked=true;},disconnect:()=>{exists=false;},viewer:()=>{role='viewer';},missingPost:()=>{postId=null;},wrongParent:()=>{parent='100_other';},old:()=>{inbound='2026-10-05T00:00:00Z';},future:()=>{inbound='2026-10-08T00:00:00Z';},uncertain:()=>{uncertain=true;},local:()=>{local=true;},sends:()=>sends,recipient:()=>recipient};
}
test('workspaceAndTargetIsolation',async()=>{
  const f=fixture();f.block();await assert.rejects(f.service.listConversations(context));
  const g=fixture();g.account.workspaceId='other';await assert.rejects(g.service.listConversations(context));
  const h=fixture();h.disconnect();await assert.rejects(h.service.listComments(context,'schedule'));
  const i=fixture();i.viewer();await assert.rejects(i.service.replyToConversation(context,'thread','reply'));assert.equal(i.sends(),0);
});
test('capabilitiesReportActualSubscriptionNotJustPermission',async()=>{
  const f=fixture();assert.equal((await f.service.getCapabilities(context)).subscription.status,'missing');
});
test('replyNeedsVerifiedTargetAndWindow',async()=>{
  const f=fixture();f.wrongParent();await assert.rejects(f.service.replyToComment(context,'schedule','comment','reply'));assert.equal(f.sends(),0);
  const g=fixture();g.old();await assert.rejects(g.service.replyToConversation(context,'thread','reply'));assert.equal(g.sends(),0);
  const h=fixture();assert.equal((await h.service.replyToConversation(context,'thread','reply')).status,'sent');assert.equal(h.recipient(),'customer');assert.equal(h.sends(),1);
});
test('publishedPostIdRequiredAndErrorsVisible',async()=>{
  const f=fixture();f.missingPost();await assert.rejects(f.service.listComments(context,'schedule'),(e:any)=>e.statusCode===409);
  const g=fixture();g.account.credential.scopes=[];await assert.rejects(g.service.listComments(context,'schedule'),(e:any)=>e.statusCode===403);
  const h=fixture();assert.deepEqual(await h.service.listComments(context,'schedule'),{items:[],nextCursor:null});
});
test('futureInboundCannotOpenWindowAndUncertainReplyIsNotRetried',async()=>{
  const f=fixture();f.future();await assert.rejects(f.service.replyToConversation(context,'thread','reply'));assert.equal(f.sends(),0);
  const g=fixture();g.uncertain();assert.deepEqual(await g.service.replyToConversation(context,'thread','reply'),{status:'unknown',diagnosticId:'diagnostic'});assert.equal(g.sends(),1);
});
test('receivedConversationsStayAccountScopedAndCanReplyWithinVerifiedWindow',async()=>{
  const f=fixture();f.local();
  assert.equal((await f.service.listConversations(context)).items[0].id,'local:thread');
  assert.equal((await f.service.listMessages(context,'local:thread')).items[0].text,'hello');
  await assert.rejects(f.service.listMessages(context,'local:foreign'));
  assert.equal((await f.service.replyToConversation(context,'local:thread','reply')).status,'sent');assert.equal(f.recipient(),'customer');
});
