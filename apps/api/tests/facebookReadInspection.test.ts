import test from 'node:test';
import assert from 'node:assert/strict';
import {FacebookDirectoryError,createFacebookDirectoryClient} from '../src/facebookManagement/graphDirectory';

const grant=()=>({pageId:'100',scopes:['pages_messaging'],granularScopes:[],expiresAt:null});
async function moduleUnderTest(){const m=await import('../src/facebookManagement/readInspection').catch(()=>null);assert.ok(m,'read-only request inspection guard required');return m;}

test('one read operation coalesces sequential and concurrent inspection but never shares positive evidence across requests',async()=>{
 const m=await moduleUnderTest(),inspect=m.createFacebookReadInspectionGuard();let calls=0;
 const remote=async()=>{calls++;await Promise.resolve();return grant();};
 await m.withFacebookReadInspection(async()=>{const [a,b]=await Promise.all([inspect('grant-a',remote),inspect('grant-a',remote)]);a.scopes.push('tampered');assert.deepEqual(b.scopes,['pages_messaging']);assert.deepEqual((await inspect('grant-a',remote)).scopes,['pages_messaging']);});
 assert.equal(calls,1);await m.withFacebookReadInspection(()=>inspect('grant-a',remote));assert.equal(calls,2);
 await inspect('grant-a',remote);await inspect('grant-a',remote);assert.equal(calls,4);
});

test('fresh send inspections bypass read reuse and new grant epochs cannot borrow old inspection evidence',async()=>{
 const m=await moduleUnderTest(),inspect=m.createFacebookReadInspectionGuard();let calls=0;
 await m.withFacebookReadInspection(async()=>{const remote=async()=>{calls++;return grant();};await inspect('epoch-1',remote);await inspect('epoch-2',remote);await inspect('epoch-1',remote,{fresh:true});await inspect('epoch-1',remote,{fresh:true});});assert.equal(calls,4);
});

test('provider rate limits suppress repeated reads and writes until cooldown, then require a fresh successful inspection',async()=>{
 const m=await moduleUnderTest();let now=1000,calls=0;const inspect=m.createFacebookReadInspectionGuard({now:()=>now});
 const limited=async()=>{calls++;throw new FacebookDirectoryError('rate_limited',120);};
 await assert.rejects(()=>inspect('a',limited),(e:any)=>e.kind==='rate_limited'&&e.retryAfterSeconds===120);
 now+=1000;await assert.rejects(()=>inspect('other',async()=>{calls++;return grant();},{fresh:true}),(e:any)=>e.kind==='rate_limited'&&e.retryAfterSeconds===119);assert.equal(calls,1);
 now=121001;assert.deepEqual(await inspect('a',async()=>{calls++;return grant();}),grant());assert.equal(calls,2);
});

test('late successful reads cannot clear a newer app rate limit',async()=>{
 const m=await moduleUnderTest();let now=0,finish!:(v:any)=>void;const inspect=m.createFacebookReadInspectionGuard({now:()=>now}),slow=inspect('a',()=>new Promise(resolve=>{finish=resolve;}));
 await assert.rejects(()=>inspect('b',async()=>{throw new FacebookDirectoryError('rate_limited');}));finish(grant());await slow;
 await assert.rejects(()=>inspect('c',async()=>grant()),(e:any)=>e.kind==='rate_limited');now=61000;await inspect('c',async()=>grant());
});

test('failed authorization is not reused as positive evidence or treated as rate limiting',async()=>{
 const m=await moduleUnderTest(),inspect=m.createFacebookReadInspectionGuard();let calls=0;
 await m.withFacebookReadInspection(async()=>{await assert.rejects(()=>inspect('a',async()=>{calls++;throw new FacebookDirectoryError('authorization_invalid');}));assert.deepEqual(await inspect('a',async()=>{calls++;return grant();}),grant());});assert.equal(calls,2);
});

test('directory preserves bounded Retry-After for app error 4 without exposing provider messages',async()=>{
 const client=createFacebookDirectoryClient({userToken:'test-user',appId:'123',appSecret:'test-secret',apiVersion:'v26.0',fetchImpl:async()=>Response.json({error:{code:4,message:'never expose test-secret'}},{status:403,headers:{'Retry-After':'120'}})});
 await assert.rejects(()=>client.inspectPageToken('100','test-page'),(e:any)=>{assert.equal(e.kind,'rate_limited');assert.equal(e.retryAfterSeconds,120);assert.doesNotMatch(e.message,/test-secret/);return true;});
});

test('cooldown recovery within a long read operation cannot reuse pre-limit evidence',async()=>{
 const m=await moduleUnderTest();let now=0,calls=0;const inspect=m.createFacebookReadInspectionGuard({now:()=>now});
 await m.withFacebookReadInspection(async()=>{await inspect('a',async()=>{calls++;return grant();});await assert.rejects(()=>inspect('b',async()=>{throw new FacebookDirectoryError('rate_limited');}));now=61000;await inspect('a',async()=>{calls++;return grant();});assert.equal(calls,2);});
});
