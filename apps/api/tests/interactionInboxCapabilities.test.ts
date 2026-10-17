import test from 'node:test';
import assert from 'node:assert/strict';

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
