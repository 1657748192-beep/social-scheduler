import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {act} from 'react-test-renderer';import {withInboxUI,inboxAccount,inboxPage,inboxCase} from './helpers/interactionInboxUI';import {facebookButton,facebookText} from './helpers/facebookManagementUI';
test('fivePlatformsThreeKindsAndExplicitSelectionLimits',async()=>{
 const m=await import('../components/inbox/unified/UnifiedInbox').catch(()=>null);assert.ok(m,'unified inbox required');
 await withInboxUI(<m.UnifiedInbox token="synthetic" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view,requests}:any)=>{
  for(const label of ['Facebook','Instagram','TikTok','YouTube','Pinterest','评论','私信','@提及'])assert.match(facebookText(view),new RegExp(label));
  assert.match(facebookText(view),/Customer One/);assert.ok(requests.every((r:any)=>r.method==='GET'));assert.match(facebookText(view),/已选 1/);
  await act(async()=>facebookButton(view,'Instagram').props.onClick());assert.doesNotMatch(facebookText(view),/Customer One/);
 },url=>url.pathname.endsWith('/accounts')&&url.searchParams.get('platform')==='instagram'?Response.json(inboxPage([])):undefined);
});
test('staleResponseAndInjectedCursorNeverLeakPreviousScope',async()=>{
 const m=await import('../components/inbox/unified/UnifiedInbox').catch(()=>null);assert.ok(m);let finish!:(r:Response)=>void;
 await withInboxUI(<m.UnifiedInbox token="synthetic" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view}:any)=>{
  await act(async()=>facebookButton(view,'TikTok').props.onClick());await act(async()=>finish(Response.json(inboxPage([{...inboxCase,customerName:'Old private customer'}]))));assert.doesNotMatch(facebookText(view),/Old private customer/);
 },url=>url.pathname.endsWith('/cases')?new Promise(resolve=>{finish=resolve;}):undefined);
});
test('account picker rejects fifty-one selected accounts without truncating the selection',async()=>{
 const m=await import('../components/inbox/unified/AccountPicker').catch(()=>null);assert.ok(m);let applied:string[]=[];
 await withInboxUI(<m.AccountPicker accounts={Array.from({length:51},(_,i)=>({...inboxAccount,id:String(i)})) as any} selectedIds={[]} onApply={ids=>{applied=ids;}} onLoadMore={()=>{}}/>,async({view}:any)=>{await act(async()=>view.root.findByProps({'aria-label':'选择账号'}).props.onClick());await act(async()=>facebookButton(view,'选择当前筛选结果').props.onClick());assert.match(facebookText(view),/最多选择 50/);assert.equal(applied.length,0);});
});
