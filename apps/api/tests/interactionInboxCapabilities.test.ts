import test from 'node:test';
import assert from 'node:assert/strict';

test('fifty refresh partitions retain bounded opaque continuations and resume only pending accounts',async()=>{
 const {createInboxReception}=await import('../src/interactionInbox/reception');const values=new Map<string,string>(),seen:string[]=[];
 const db:any={interactionAsset:{findUnique:async()=>({id:'asset'}),findUniqueOrThrow:async()=>({id:'asset'})},interactionSyncState:{upsert:async()=>{}}};
 const access:any={require:async()=>{},resolveInboxAsset:async(_ctx:any,id:string)=>({accountId:id,canonicalKey:id,platform:'facebook'}),write:async(_ctx:any,fn:any)=>fn(db)};
 const redis:any={eval:async()=>1,zrem:async()=>1,set:async(k:string,v:string)=>{values.set(k,v);},get:async(k:string)=>values.get(k)};
 const registry:any={getInboxAdapter:()=>({list:async(a:any,_kind:any,cursor:string|null)=>{seen.push(a.accountId);return{items:[],coverage:'synthetic',warnings:[],nextCursor:cursor?null:'x'.repeat(1800)};}})};
 const reception=createInboxReception({db,access,redis,registry,projection:{projectVerifiedPage:async()=>({revision:1,count:1})} as any});
 const accountIds=Array.from({length:50},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`),ctx={workspaceId:'w',userId:'u',sessionId:'s'};
 const first=await reception.refreshInbox(ctx,{accountIds,kind:'messages'});assert.ok(first.nextCursor&&first.nextCursor.length<2048);assert.equal(first.partial,true);
 const second=await reception.refreshInbox(ctx,{accountIds,kind:'messages',cursor:first.nextCursor});assert.equal(second.nextCursor,null);assert.equal(seen.length,100);
});

test('retention maintenance runs without any visiting administrator',async()=>{
 const {startInboxRetention}=await import('../src/interactionInbox/sourceLifetime');let ticks=0,callback!:()=>void;
 const pump=startInboxRetention({pruneInbox:async()=>{ticks++;return 0;}},((fn:any)=>{callback=fn;return{unref(){}};}) as any);
 await new Promise(r=>setImmediate(r));assert.equal(ticks,1);callback();await new Promise(r=>setImmediate(r));assert.equal(ticks,2);await pump.stop();callback();assert.equal(ticks,2);
});

test('comment detail cannot display another customer as the selected reply target',async()=>{
 const {createFacebookInboxAdapter}=await import('../src/interactionInbox/adapters/facebook');
 const source={managedPageId:'11111111-1111-4111-8111-111111111111',connectionId:'22222222-2222-4222-8222-222222222222',connectionVersion:1,scheduleId:'33333333-3333-4333-8333-333333333333',commentId:'selected'};
 const adapter=createFacebookInboxAdapter({db:{} as any,engagement:{commentReplies:async()=>({parent:null,items:[{id:'other',text:'Other customer',timestamp:new Date().toISOString()}],nextCursor:'next'}),capabilities:async()=>({})} as any});
 const result=await adapter.detail({platform:'facebook',sourceRef:source,connectionVersion:1,ctx:{},providerAssetId:'100'} as any,source);
 assert.deepEqual(result.items,[]);assert.equal(result.replyTarget,null);
});

test('new customer persistence is closed without explicit policy verification',async()=>{
 const {createInboxProjection}=await import('../src/interactionInbox/projection');let touched=false;
 const projection=createInboxProjection({db:{} as any,access:{resolveInboxAsset:async()=>{touched=true;}} as any});
 await assert.rejects(projection.projectVerifiedPage({} as any,{} as any,{items:[],nextCursor:null,coverage:'test',warnings:[]}),(e:any)=>e.statusCode===409);
 assert.equal(touched,false);
});

test('maximum selected-account scope produces a decodable bounded cursor',async()=>{
 const {encodeInboxCursor,decodeInboxCursor}=await import('../src/interactionInbox/cursor');
 const scope={accountIds:Array.from({length:50},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`),tagIds:Array.from({length:10},(_,i)=>String(i))};
 const payload={time:new Date().toISOString(),id:scope.accountIds[0]};const encoded=encodeInboxCursor(scope,payload);
 assert.ok(encoded.length<=2048);assert.deepEqual(decodeInboxCursor(scope,encoded),payload);
 assert.throws(()=>decodeInboxCursor({...scope,accountIds:[]},encoded));
});

test('unknownApprovalAndPublishingScopesNeverEnableInteractions',async()=>{
 const m=await import('../src/interactionInbox/capabilities').catch(()=>null);assert.ok(m,'capability evaluator is required');
 const e={capability:'comments.read' as const,supported:true,integrated:true,productOpen:true,approval:'unknown' as const,grant:'valid' as const,roleAllowed:true,verifiedAt:new Date().toISOString(),providerRestriction:null};
 assert.equal(m.evaluateCapability(e).available,false);assert.equal(m.evaluateCapability(e).reason,'approval_unverified');
 assert.equal(m.evaluateCapability({...e,approval:'pending'}).reason,'review_pending');
 assert.equal(m.evaluateCapability({...e,approval:'approved',grant:'missing'}).available,false);
 assert.equal(m.evaluateCapability({...e,approval:'approved'}).available,true);
 assert.equal(m.evaluateCapability({...e,integrated:false}).reason,'not_integrated');
 assert.equal(m.evaluateCapability({...e,approval:'approved',verifiedAt:null}).available,false);
});
test('queryLimits reject hidden all-account queries and unbounded selection/search',async()=>{
 const m=await import('../src/interactionInbox/limits').catch(()=>null);assert.ok(m,'query validator is required');
 const ids=Array.from({length:50},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
 assert.equal(m.parseQuery({accountIds:ids,kind:'comments'}).limit,25);
 assert.throws(()=>m.parseQuery({accountIds:[...ids,'00000000-0000-4000-8000-000000000099'],kind:'comments'}));
 assert.throws(()=>m.parseQuery({accountIds:[],kind:'comments'}));
 assert.throws(()=>m.parseQuery({accountIds:ids,kind:'comments',q:'x'.repeat(101)}));
 assert.throws(()=>m.parseQuery({accountIds:ids,kind:'comments',limit:51}));
 assert.throws(()=>m.parseQuery({accountIds:ids,kind:'comments',enabled:true}));
 assert.equal(m.parseQuery({accountIds:ids,kind:'messages'}).searchMessages,false);
});
