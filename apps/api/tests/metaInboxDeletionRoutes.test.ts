import test from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';import express from 'express';
import {verifyMetaSignedRequest,createMetaDeletionRouter} from '../src/interactionInbox/metaDeletionRoutes';
const secret='synthetic-deletion-secret-only',issuedAt=Math.floor(Date.now()/1000);
function sign(value:unknown,key=secret){const payload=Buffer.from(JSON.stringify(value)).toString('base64url');return createHmac('sha256',key).update(payload).digest('base64url')+'.'+payload;}
const proof=()=>sign({algorithm:'HMAC-SHA256',user_id:'200',issued_at:issuedAt});
async function server(deletion:any,run:(url:string)=>Promise<void>){const app=express();app.use('/hook',createMetaDeletionRouter({namespace:{platform:'instagram',appId:'456'},secret,statusBaseUrl:'https://app.example.test/hook/status',deletion,statusStore:{status:async(code:string)=>code==='x'.repeat(43)?'completed':null}}));const http=app.listen(0,'127.0.0.1');await new Promise<void>(r=>http.once('listening',r));try{await run(`http://127.0.0.1:${(http.address() as any).port}/hook`);}finally{http.closeAllConnections();await new Promise<void>(r=>http.close(()=>r()));}}
test('signedRequestBindsExactBytesAndRejectsWrongAlgorithmTimeAndUser',()=>{
 assert.deepEqual(verifyMetaSignedRequest(proof(),secret),{userId:'200',issuedAt});
 for(const value of [proof()+'x',sign({algorithm:'SHA256',user_id:'200',issued_at:issuedAt}),sign({algorithm:'HMAC-SHA256',user_id:200,issued_at:issuedAt}),sign({algorithm:'HMAC-SHA256',user_id:'200',issued_at:issuedAt+3600}),sign({algorithm:'HMAC-SHA256',user_id:'200',issued_at:issuedAt-8*86400}),sign({algorithm:'HMAC-SHA256',user_id:'200',issued_at:issuedAt},'other-secret')])assert.throws(()=>verifyMetaSignedRequest(value,secret));
});
test('forgedDeletionCannotPurge',async()=>{
 let purges=0;await server({requestUserDeletion:async()=>{purges++;return{confirmationCode:'x'.repeat(43)};}},async url=>{
  const result=await fetch(url+'/data-deletion',{method:'POST',body:new URLSearchParams({signed_request:sign({algorithm:'HMAC-SHA256',user_id:'200',issued_at:issuedAt},'other-secret')})});assert.equal(result.status,403);assert.equal(purges,0);assert.doesNotMatch(await result.text(),/other-secret|200|stack/);
 });
});
test('verifiedDeletionUsesServerBoundAppNotFrontendAppAndReturnsOpaqueReceipt',async()=>{
 const received:any[]=[];await server({requestUserDeletion:async(...args:any[])=>{received.push(args);return{confirmationCode:'x'.repeat(43)};}},async url=>{
  const result=await fetch(url+'/data-deletion',{method:'POST',body:new URLSearchParams({signed_request:proof(),appId:'999',workspaceId:'foreign'})});assert.equal(result.status,200);assert.deepEqual(received[0],[{platform:'instagram',appId:'456'},{userId:'200',issuedAt},'data_deletion']);
  assert.deepEqual(await result.json(),{url:'https://app.example.test/hook/status/'+'x'.repeat(43),confirmation_code:'x'.repeat(43)});assert.equal(result.headers.get('cache-control'),'no-store');
 });
});
test('publicStatusContainsNoSubjectAndUnknownCodeIsNotEnumerated',async()=>server({},async url=>{
 const result=await fetch(url+'/status/'+'x'.repeat(43));assert.equal(result.status,200);assert.deepEqual(await result.json(),{status:'completed'});assert.equal(result.headers.get('cache-control'),'no-store');assert.equal((await fetch(url+'/status/'+'y'.repeat(43))).status,404);
}));
test('databaseFailureDoesNotClaimDeletionAcceptedAndBodyErrorsAreSanitized',async()=>server({requestUserDeletion:async()=>{throw Error('private-target-and-token');}},async url=>{
 const result=await fetch(url+'/data-deletion',{method:'POST',body:new URLSearchParams({signed_request:proof()})});assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/private-target|token|stack/);
 const huge=await fetch(url+'/data-deletion',{method:'POST',body:new URLSearchParams({signed_request:'x'.repeat(40000)})});assert.equal(huge.status,413);assert.doesNotMatch(await huge.text(),/AppData|<pre>|PayloadTooLargeError/);
}));
