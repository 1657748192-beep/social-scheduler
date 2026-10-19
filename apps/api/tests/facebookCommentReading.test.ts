import assert from 'node:assert/strict';
import test from 'node:test';
import {createFacebookEngagementClient,FacebookEngagementError} from '../src/integrations/social/facebookEngagement';
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status});
const make=(handler:(u:URL)=>Promise<Response>)=>createFacebookEngagementClient({pageId:'100',accessToken:'test-only-token',apiVersion:'v26.0',fetchImpl:(async(u,init)=>{assert.equal(init?.method,'GET');return handler(new URL(String(u)));}) as typeof fetch});

test('photoStoryIdentityRequiresProviderMappingAndOwnedAttachmentNotMatchingNumericSuffix',async()=>{
 const c=make(async u=>{
  if(u.pathname==='/v26.0/200')return u.searchParams.get('fields')==='id,from{id}'?json({id:'200',from:{id:'100'}}):json({id:'200',page_story_id:'100_201'});
  assert.equal(u.pathname,'/v26.0/100_201');return json({id:'100_201',from:{id:'100'},attachments:{data:[{target:{id:'200'}}]}});
 });
 assert.deepEqual(await c.getPostIdentity('200'),{id:'100_201',pageId:'100',sourceId:'200'});
});

test('photoStoryIdentityRejectsForeignOwnerWrongMappingAndUnrelatedAttachment',async()=>{
 for(const changed of [{owner:'999',story:'100_201',target:'200'},{owner:'100',story:'999_201',target:'200'},{owner:'100',story:'100_201',target:'999'}]){
  const c=make(async u=>u.pathname==='/v26.0/200'?(u.searchParams.get('fields')==='id,from{id}'?json({id:'200',from:{id:'100'}}):json({id:'200',page_story_id:changed.story})):json({id:changed.story,from:{id:changed.owner},attachments:{data:[{target:{id:changed.target}}]}}));
  await assert.rejects(c.getPostIdentity('200'));
 }
});

test('minimalCommentPageRetainsRowsSuppressedByOptionalAuthorFields',async()=>{
 const c=make(async u=>u.searchParams.get('fields')?.includes('from')?json({data:[{id:'200_1',message:'one',created_time:'2026-10-19T01:00:00Z',from:{id:'300',name:'Customer'}}]}):json({data:[{id:'200_1',message:'one',created_time:'2026-10-19T01:00:00Z'},{id:'200_2',message:'two',created_time:'2026-10-19T01:01:00Z'}],paging:{next:'https://graph.facebook.com/next',cursors:{after:'next-cursor'}}}));
 const p=await c.listComments('100_201');assert.equal(p.items.length,2);assert.equal(p.items[0].text,'one');assert.equal(p.items[0].senderId,'300');assert.equal(p.items[1].text,'two');assert.equal(p.items[1].senderId,undefined);assert.equal(p.nextCursor,'next-cursor');
});

test('optionalAuthorCannotInsertForeignCommentOrReplaceAuthoritativeBody',async()=>{
 const c=make(async u=>u.searchParams.get('fields')?.includes('from')?json({data:[{id:'200_1',message:'stale',created_time:'2026-10-19T01:00:00Z',from:{id:'300',name:'Customer'}},{id:'999_9',message:'foreign',created_time:'2026-10-19T01:00:00Z',from:{id:'999',name:'Foreign'}}]}):json({data:[{id:'200_1',message:'current',created_time:'2026-10-19T01:00:00Z'}]}));
 const p=await c.listComments('100_201');assert.equal(p.items.length,1);assert.equal(p.items[0].text,'current');assert.equal(p.items[0].senderId,'300');
});

test('authorReadFailureDoesNotLoseCommentButTokenRevocationStillFailsClosed',async()=>{
 for(const code of [100,190]){
  const c=make(async u=>u.searchParams.get('fields')?.includes('from')?json({error:{code,message:'test-only-token'}},400):json({data:[{id:'200_1',message:'current',created_time:'2026-10-19T01:00:00Z'}]}));
  if(code===190)await assert.rejects(c.listComments('100_201'),(e:unknown)=>e instanceof FacebookEngagementError&&e.kind==='authorization_invalid');
  else {const p=await c.listComments('100_201');assert.equal(p.items[0].text,'current');assert.equal(p.items[0].senderId,undefined);}
 }
});
