import assert from 'node:assert/strict';
import test from 'node:test';
import { createFacebookEngagementClient, FacebookEngagementError } from '../src/integrations/social/facebookEngagement';
import { isFacebookMessagingWindowOpen } from '../src/integrations/social/facebookMessagingPolicy';

const options = { pageId: '100', accessToken: 'private-page-token', apiVersion: 'v20.0', appId: 'app', appSecret: 'private-app-secret' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function client(handler: (url: URL, init?: RequestInit) => Promise<Response>) {
  return createFacebookEngagementClient({ ...options, fetchImpl: (async (url, init) => handler(new URL(String(url)), init)) as typeof fetch });
}

test('capabilitiesDoNotAssumeRequestedScopes', async () => {
  const c = client(async url => {
    assert.equal(url.hostname, 'graph.facebook.com');
    if (url.pathname.endsWith('/debug_token')) return json({ data: { app_id: 'app', type: 'PAGE', profile_id: '100', is_valid: true,
      scopes: ['pages_read_engagement', 'pages_read_user_content', 'pages_manage_posts'], granular_scopes: [] } });
    return json({ id: '100' });
  });
  const result = await c.inspectCapabilities();
  assert.equal(result.readComments.status, 'available');
  assert.equal(result.replyMessages.status, 'missing');
  assert.equal(result.replyComments.status, 'missing');
  assert.equal('publishing' in result, false);
});

test('capabilityNetworkFailureIsUnknown', async () => {
  const result = await client(async () => { throw new Error('contains private-page-token'); }).inspectCapabilities();
  assert.equal(result.readComments.status, 'unknown');
  assert.equal(JSON.stringify(result).includes('private-page-token'), false);
});

test('granularGrantForAnotherPageIsNotAvailable', async () => {
  const result = await client(async url => url.pathname.endsWith('/debug_token') ? json({ data: {
    app_id: 'app', type: 'PAGE', is_valid: true, scopes: ['pages_messaging','pages_read_engagement','pages_manage_metadata'],
    granular_scopes: [{ scope: 'pages_messaging', target_ids: ['999'] }]
  } }) : json({id:'100'})).inspectCapabilities();
  assert.equal(result.replyMessages.status, 'missing');
});

test('mismatchedOrInvalidTokenIdentityIsRejected', async () => {
  await assert.rejects(client(async () => json({data:{is_valid:false}})).inspectCapabilities(),
    (e: unknown) => e instanceof FacebookEngagementError && e.kind === 'authorization_invalid');
  await assert.rejects(client(async url => url.pathname.endsWith('/debug_token') ? json({data:{is_valid:true,app_id:'other',type:'PAGE',scopes:[]}}) : json({id:'100'})).inspectCapabilities(),
    (e: unknown) => e instanceof FacebookEngagementError && e.kind === 'authorization_invalid');
});

test('safePagingAndOwnership', async () => {
  const requests: URL[] = [];
  const c = client(async url => {
    requests.push(url);
    if (url.pathname.endsWith('/100_200/comments')) return json({ data: [{id:'comment',message:'hello',created_time:'2026-10-07T01:00:00Z',from:{id:'user',name:'Customer'}}],
      paging:{cursors:{after:'cursor'},next:'https://attacker.invalid/?access_token=stolen'} });
    if (url.pathname.endsWith('/comment')) return json({id:'comment',message:'hello',created_time:'2026-10-07T01:00:00Z',object:{id:'100_200'}});
    return json({id:'100_200',from:{id:'100'}});
  });
  const page = await c.listComments('100_200');
  assert.equal(page.nextCursor,'cursor');
  assert.equal(page.items[0].postId,'100_200');
  assert.equal((await c.getComment('comment')).postId,'100_200');
  await c.listComments('100_200','cursor');
  assert.equal(requests.at(-1)?.searchParams.get('after'),'cursor');
  assert.ok(requests.every(url => url.hostname === 'graph.facebook.com'));
});

test('conversationParticipantsAndMessagesAreValidated', async () => {
  const c = client(async url => url.pathname.endsWith('/thread/messages') ? json({data:[
    {id:'m1',message:'hi',created_time:'2026-10-07T01:00:00Z',from:{id:'customer'},to:{data:[{id:'100'}]}}
  ]}) : json({id:'thread',updated_time:'2026-10-07T01:00:00Z',participants:{data:[{id:'100'},{id:'customer',name:'C'}]}}));
  assert.equal((await c.getConversation('thread')).counterpartyId,'customer');
  assert.equal((await c.listMessages('thread')).items[0].inbound,true);
  await assert.rejects(client(async () => json({id:'thread',participants:{data:[{id:'999'},{id:'customer'}]}})).getConversation('thread'));
});

test('emptyListIsNotMalformedOrPermissionFailure', async () => {
  assert.deepEqual(await client(async () => json({data:[]})).listComments('100_200'),{items:[],nextCursor:null});
  await assert.rejects(client(async () => json({})).listComments('100_200'));
  await assert.rejects(client(async () => json({error:{code:200,message:'private-app-secret',fbtrace_id:'trace-1'}},403)).listComments('100_200'),
    (e: unknown) => e instanceof FacebookEngagementError && e.kind === 'permission_missing' && !e.message.includes('private-app-secret'));
});

test('messagingWindowBoundary', () => {
  const now = new Date('2026-10-07T02:00:00Z');
  for (const [value,want] of [[null,false],[new Date(now.getTime()-86400000),false],[new Date(now.getTime()-23*3600000),true],[new Date(now.getTime()+1),false],[new Date('invalid'),false]] as const) {
    assert.equal(isFacebookMessagingWindowOpen(value,now),want);
  }
});

test('uncertainSendNotRetried', async () => {
  let calls = 0;
  const c = client(async (_url,init) => { calls++; assert.equal(init?.method,'POST'); throw new Error('private-page-token'); });
  const result = await c.sendMessage('customer','reply');
  assert.equal(result.status,'unknown');
  assert.equal(calls,1);
  assert.equal(JSON.stringify(result).includes('private-page-token'),false);
});

test('sendPayloadAndConfirmedOutcome', async () => {
  const c = client(async (url,init) => {
    assert.equal(url.pathname,'/v20.0/100/messages');
    assert.equal(url.searchParams.has('access_token'),false);
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer private-page-token');
    assert.deepEqual(JSON.parse(String(init?.body)),{recipient:{id:'customer'},messaging_type:'RESPONSE',message:{text:'reply'}});
    return json({recipient_id:'customer',message_id:'mid.1'});
  });
  assert.deepEqual(await c.sendMessage('customer','reply'),{status:'sent',providerId:'mid.1'});
});

test('sendErrorsAreClassifiedAndBadInputDoesNotReachMeta', async () => {
  await assert.rejects(client(async () => json({error:{code:190}},400)).sendMessage('customer','reply'),
    (e: unknown) => e instanceof FacebookEngagementError && e.kind === 'authorization_invalid');
  let calls=0;
  const c=client(async () => {calls++;return json({});});
  await assert.rejects(c.sendMessage('customer',' '));
  await assert.rejects(c.listComments('https://attacker.invalid'));
  assert.equal(calls,0);
});

test('subscriptionsSelectCurrentAppAndWriteExactFields', async () => {
  const c=client(async (_url,init) => {
    if (init?.method === 'POST') { assert.equal(new URLSearchParams(String(init.body)).get('subscribed_fields'),'feed,messages');return json({success:true}); }
    if (init?.method === 'DELETE') return json({success:true});
    return json({data:[{id:'other',subscribed_fields:['feed','messages']},{id:'app',subscribed_fields:['feed']}]});
  });
  assert.equal((await c.getSubscription()).status,'missing');
  assert.equal(await c.subscribe(),true);
  assert.equal(await c.unsubscribe(),true);
});
