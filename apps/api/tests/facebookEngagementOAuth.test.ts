import assert from 'node:assert/strict';
import test from 'node:test';
import { createFacebookEngagementAuthorizationService, type FacebookOAuthStore } from '../src/services/facebookEngagementOAuth';

function fixture() {
  let enabled=true,manager=true,connected=true;
  let state: any=null;
  let credential='old-encrypted';
  let writes=0, exchanges=0;
  let grant={pageId:'100',pageToken:'new-token',scopes:['pages_manage_posts','pages_read_engagement','pages_messaging'],expiresAt:null as Date|null};
  const store: FacebookOAuthStore={
    async account() {return connected ? {id:'account',providerAccountId:'100',scopes:['pages_manage_posts','pages_read_engagement'],accessTokenEncrypted:credential} : null;},
    async create(value) {state=value;},
    async consume(value) {if(state?.state !== value)return null;const found=state;state=null;return found;},
    async save(value) {if(!connected || value.expectedTokenHash !== hash(credential))return false;credential='encrypted-new';writes++;return true;}
  };
  const hash = (value:string) => require('node:crypto').createHash('sha256').update(value).digest('hex');
  const service=createFacebookEngagementAuthorizationService({store,enabled:()=>enabled,requireManager:async()=>{if(!manager)throw new Error('Forbidden');},
    authorization:{url:'https://www.facebook.com/v20.0/dialog/oauth',clientId:'app',redirectUri:'https://example.test/callback',defaultScopes:['public_profile'],loginConfigId:''},
    exchange:async()=>{exchanges++;return grant;},now:()=>new Date('2026-10-07T00:00:00Z')});
  return {service,getState:()=>state,getCredential:()=>credential,writes:()=>writes,exchanges:()=>exchanges,
    setGrant:(value:typeof grant)=>{grant=value;},disable:()=>{enabled=false;},demote:()=>{manager=false;},disconnect:()=>{connected=false;},rotate:()=>{credential='rotated-encrypted';}};
}

test('reauthPreservesPublishing',async()=>{
  const f=fixture();const result=await f.service.start('user','workspace','account');
  const scopes=new URL(result.authorizationUrl).searchParams.get('scope')!.split(',');
  assert.ok(scopes.includes('pages_manage_posts'));assert.ok(scopes.includes('pages_manage_engagement'));assert.ok(scopes.includes('pages_messaging'));
  const state=f.getState().state;
  f.setGrant({pageId:'100',pageToken:'new',scopes:['pages_messaging'],expiresAt:null});
  await assert.rejects(f.service.complete(state,'code'));
  assert.equal(f.getCredential(),'old-encrypted');assert.equal(f.writes(),0);
});
test('wrongPageAndCancellationLeaveCredentialIntact',async()=>{
  const f=fixture();await f.service.start('user','workspace','account');
  f.setGrant({pageId:'999',pageToken:'new',scopes:['pages_manage_posts','pages_read_engagement'],expiresAt:null});
  await assert.rejects(f.service.complete(f.getState().state,'code'));
  await f.service.start('user','workspace','account');await assert.rejects(f.service.complete(f.getState().state,undefined,'access_denied'));
  assert.equal(f.getCredential(),'old-encrypted');assert.equal(f.writes(),0);assert.equal(f.exchanges(),1);
});
test('reauthRaceAndRoles',async()=>{
  const f=fixture();await f.service.start('user','workspace','account');const state=f.getState().state;f.rotate();
  await assert.rejects(f.service.complete(state,'code'));assert.equal(f.getCredential(),'rotated-encrypted');
  await assert.rejects(f.service.complete(state,'code'));assert.equal(f.exchanges(),0);
  await f.service.start('user','workspace','account');const deletedState=f.getState().state;f.disconnect();
  await assert.rejects(f.service.complete(deletedState,'code'));assert.equal(f.writes(),0);
  const g=fixture();g.demote();await assert.rejects(g.service.start('user','workspace','account'));assert.equal(g.getState(),null);
});
test('partialInteractionGrantDoesNotDisablePublishing',async()=>{
  const f=fixture();await f.service.start('user','workspace','account');
  f.setGrant({pageId:'100',pageToken:'new',scopes:['pages_manage_posts','pages_read_engagement'],expiresAt:null});
  const result=await f.service.complete(f.getState().state,'code');
  assert.equal(result.socialAccountId,'account');assert.equal(f.writes(),1);
});
test('expiredDisabledAndDemotedCallbacksCannotWrite',async()=>{
  const f=fixture();await f.service.start('user','workspace','account');f.getState().expiresAt=new Date(0);
  await assert.rejects(f.service.complete(f.getState().state,'code'));assert.equal(f.exchanges(),0);
  const g=fixture();await g.service.start('user','workspace','account');const state=g.getState().state;g.disable();
  await assert.rejects(g.service.complete(state,'code'));assert.equal(g.writes(),0);
  const h=fixture();await h.service.start('user','workspace','account');h.demote();
  await assert.rejects(h.service.complete(h.getState().state,'code'));assert.equal(h.exchanges(),0);
});
