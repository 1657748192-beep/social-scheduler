import test from 'node:test';import assert from 'node:assert/strict';
import {createInstagramManagementOAuth} from '../src/instagramManagement/oauth';
import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';

test('independentOAuthUsesDocumentedReauthenticationAndNeverRequestsPublishingScopes',async()=>{
 // Only state persistence is replaced; actual state generation, input parsing
 // and provider URL construction run here. Real DB authorization/state replay
 // and publishing-snapshot invariants run in the OAuth integration suite.
 const scopes=['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'];
 const oauth=createInstagramManagementOAuth({db:{} as any,config:{enabled:true,appId:'456',appSecret:'private-secret',graphVersion:'v25.0',callbackUrl:'https://example.test/api/v1/integrations/instagram-management/oauth/callback',requiredScopes:scopes},policy:createLiveInboxPolicy([]),store:{createState:async()=>({})} as any,exchange:async()=>{throw Error('Must not exchange before consent');}});
 const ctx={workspaceId:'11111111-1111-4111-8111-111111111111',userId:'22222222-2222-4222-8222-222222222222',sessionId:'33333333-3333-4333-8333-333333333333'};
 const url=new URL((await oauth.start(ctx,'44444444-4444-4444-8444-444444444444')).authorizationUrl);
 assert.equal(url.origin,'https://www.instagram.com');assert.equal(url.pathname,'/oauth/authorize');assert.equal(url.searchParams.get('force_reauth'),'true');assert.equal(url.searchParams.has('force_authentication'),false);
 assert.equal(url.searchParams.get('redirect_uri'),'https://example.test/api/v1/integrations/instagram-management/oauth/callback');assert.equal(url.searchParams.get('scope'),'instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages');
 assert.match(url.searchParams.get('state')??'',/^[A-Za-z0-9_-]{43}$/);assert.equal(url.searchParams.has('client_secret'),false);
});
