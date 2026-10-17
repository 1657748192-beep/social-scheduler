import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {withInboxUI} from './helpers/interactionInboxUI';import {facebookText} from './helpers/facebookManagementUI';
test('ordinaryCustomersCannotMountOrFetchUnifiedInbox through direct or legacy pages',async()=>{
 const direct=(await import('../app/inbox/page')).default,legacy=(await import('../app/facebook-inbox/page')).default;
 for(const Page of [direct,legacy])await withInboxUI(<Page/>,async({view,requests}:any)=>{assert.match(facebookText(view),/仅限平台管理员/);assert.equal(requests.some((r:any)=>r.path.includes('interaction-inbox')||r.path.includes('facebook-management')),false);});
});
test('a stale legacy connection never falls back to the first account',async()=>{
 const m=await import('../components/inbox/unified/UnifiedInbox');await withInboxUI(<m.UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any} initialContext={{workspaceId:'w1',managedPageId:'old-page',connectionId:'old-connection'}}/>,async({view,requests}:any)=>{assert.match(facebookText(view),/原主页定位不可用/);assert.equal(requests.filter((r:any)=>r.path.endsWith('/cases')).length,0);},url=>url.pathname.endsWith('/legacy-context')?Response.json({message:'Unavailable'},{status:404}):undefined);
});
test('legacy query accepts only complete UUID contexts and never silently selects a different account',async()=>{
 const m=await import('../lib/interactionInbox');assert.equal(typeof m.parseLegacyInboxQuery,'function','strict legacy context parser required');
 assert.equal(m.parseLegacyInboxQuery('?workspaceId=other&managedPageId=x&connectionId=y'),null);
 assert.equal(m.parseLegacyInboxQuery('?workspaceId=11111111-1111-4111-8111-111111111111'),null);
 assert.deepEqual(m.parseLegacyInboxQuery('?workspaceId=11111111-1111-4111-8111-111111111111&managedPageId=22222222-2222-4222-8222-222222222222&connectionId=33333333-3333-4333-8333-333333333333'),{workspaceId:'11111111-1111-4111-8111-111111111111',managedPageId:'22222222-2222-4222-8222-222222222222',connectionId:'33333333-3333-4333-8333-333333333333'});
});
