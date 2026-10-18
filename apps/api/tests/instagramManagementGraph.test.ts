import test from 'node:test';import assert from 'node:assert/strict';
import {createInstagramManagementGraph} from '../src/instagramManagement/graph';
const config={appId:'456',graphVersion:'v25.0',accessToken:'synthetic-only',accountId:'100',connectionVersion:1};
test('providerCursorCannotChangeHost',async()=>{
 const calls:URL[]=[];const graph=createInstagramManagementGraph({...config,fetchImpl:async(url,init)=>{calls.push(new URL(String(url)));assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-only');return Response.json({data:[{id:'media-1'}],paging:{next:'https://untrusted.invalid/steal',cursors:{after:'opaque-after'}}});}});
 const page=await graph.media();assert.ok(page.nextCursor);await graph.media(page.nextCursor!);assert.equal(calls.length,2);assert.equal(calls[1].hostname,'graph.instagram.com');assert.equal(calls[1].pathname,'/v25.0/100/media');assert.equal(calls[1].searchParams.get('after'),'opaque-after');assert.equal(calls[1].searchParams.get('limit'),'25');assert.equal(calls[1].searchParams.has('access_token'),false);
 const other=createInstagramManagementGraph({...config,appId:'999',fetchImpl:async()=>{throw Error('must not fetch');}});await assert.rejects(other.media(page.nextCursor!));
 await assert.rejects(graph.comments('media-1',page.nextCursor!));
});
test('invalidProviderDTOsAndOversizePagesFailClosed',async()=>{
 for(const data of [[{id:123}],[{id:'x'.repeat(257)}],Array.from({length:26},()=>({id:'media'}))]){
  const graph=createInstagramManagementGraph({...config,fetchImpl:async()=>Response.json({data})});await assert.rejects(graph.media());
 }
 const graph=createInstagramManagementGraph({...config,fetchImpl:async()=>Response.json({data:[],paging:{cursors:{after:'unused'}}})});assert.equal((await graph.media()).nextCursor,null);
});
test('textSendUsesExplicitRecipientAndUnknownResultNeverLooksSent',async()=>{
 let calls=0;const graph=createInstagramManagementGraph({...config,fetchImpl:async(url,init)=>{calls++;assert.equal(new URL(String(url)).pathname,'/v25.0/100/messages');assert.deepEqual(JSON.parse(String(init?.body)),{recipient:{id:'300'},message:{text:'Hello'}});return Response.json({message_id:'mid-1'});}});
 assert.deepEqual(await graph.sendMessage('300','Hello'),{status:'sent',providerId:'mid-1'});await assert.rejects(graph.sendMessage('100','Hello'));await assert.rejects(graph.sendMessage('300','x'.repeat(2001)));assert.equal(calls,1);
 for(const fetchImpl of [async()=>{throw Error('secret');},async()=>Response.json({success:true}),async()=>Response.json({error:{code:1}}, {status:500})]){
  const result=await createInstagramManagementGraph({...config,fetchImpl}).sendMessage('300','Hello');assert.equal(result.status,'unknown');assert.doesNotMatch(JSON.stringify(result),/secret/);
 }
 const rejected=await createInstagramManagementGraph({...config,fetchImpl:async()=>Response.json({error:{code:200}},{status:403})}).sendMessage('300','Hello');assert.equal(rejected.status,'failed');
});
test('sourceIDsCannotInjectPathAndResponseBodiesAreBounded',async()=>{
 let calls=0;const graph=createInstagramManagementGraph({...config,fetchImpl:async()=>{calls++;return Response.json({data:[]});}});await assert.rejects(graph.comments('../other'));assert.equal(calls,0);
 const huge=createInstagramManagementGraph({...config,fetchImpl:async()=>new Response('x'.repeat(1048577))});await assert.rejects(huge.media());
});
test('dotSegmentsCannotEscapeTheVersionedAssetPath',async()=>{
 let calls=0;const graph=createInstagramManagementGraph({...config,fetchImpl:async()=>{calls++;return Response.json({data:[]});}});
 for(const value of ['.','..'])await assert.rejects(graph.comments(value));assert.equal(calls,0);
});
