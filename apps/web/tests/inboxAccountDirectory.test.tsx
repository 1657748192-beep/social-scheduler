import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {act} from 'react-test-renderer';
import {UnifiedInbox} from '../components/inbox/unified/UnifiedInbox';import {AccountPicker} from '../components/inbox/unified/AccountPicker';
import {withInboxUI,inboxAccount,inboxPage} from './helpers/interactionInboxUI';import {facebookButton,facebookText} from './helpers/facebookManagementUI';
import {LanguageToggle} from '../components/LanguageProvider';

test('platform directory remains selectable during cooldown without bypassing interaction backoff',async()=>{
 const ig={...inboxAccount,platform:'instagram',name:'MOOYAM-factory',capabilities:[]};let igDirectories=0,capabilities=0,refreshes=0;
 await withInboxUI(<UnifiedInbox token="fixture" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view,timers,requests}:any)=>{
  await act(async()=>facebookButton(view,'立即更新').props.onClick());const before=capabilities,caseReads=requests.filter((r:any)=>r.path.endsWith('/cases')).length;
  await act(async()=>facebookButton(view,'Instagram').props.onClick());assert.equal(igDirectories,1);assert.deepEqual(view.root.findByType(AccountPicker).props.accounts.map((a:any)=>a.name),['MOOYAM-factory']);assert.equal(capabilities,before);
  await act(async()=>view.root.findByType(AccountPicker).props.onApply([ig.id]));
  await act(async()=>{for(const timer of timers.values())if(timer.ms===30000)timer.callback();});assert.equal(refreshes,1);assert.equal(capabilities,before);assert.equal(requests.filter((r:any)=>r.path.endsWith('/cases')).length,caseReads);assert.equal(facebookButton(view,'立即更新').props.disabled,true);assert.equal(requests.filter((r:any)=>r.path.endsWith('/replies')).length,0);
 },url=>{if(url.pathname.endsWith('/accounts')&&url.searchParams.get('platform')==='instagram'){igDirectories++;return Response.json(inboxPage([ig]));}if(url.pathname.endsWith('/capabilities'))capabilities++;if(url.pathname.endsWith('/refresh')){refreshes++;return Response.json({details:{code:'rate_limited'}},{status:429,headers:{'Retry-After':'120'}});}});
});

test('retry repeats a failed first-page request rather than advancing its saved pagination cursor',async()=>{
 const cursors:Array<string|null>=[];let attempts=0;
 await withInboxUI(<UnifiedInbox token="fixture" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view}:any)=>{
  await act(async()=>facebookButton(view,'重新读取').props.onClick());await act(async()=>facebookButton(view,'选择账号').props.onClick());assert.match(facebookText(view),/账号目录加载失败/);
  await act(async()=>facebookButton(view,'重试加载账号').props.onClick());assert.deepEqual(cursors,[null,null,null]);assert.deepEqual(view.root.findByType(AccountPicker).props.accounts.map((a:any)=>a.name),['Updated account']);
 },url=>{if(url.pathname.endsWith('/accounts')){cursors.push(url.searchParams.get('cursor'));attempts++;if(attempts===2)return Response.json({message:'unavailable'},{status:503});return Response.json({...inboxPage([{...inboxAccount,name:attempts===1?'Old account':'Updated account'}]),nextCursor:'next-page'});}});
});

test('directory loading and failure are visible in the picker and retry only reads the directory',async()=>{
 let finish!:(r:Response)=>void,attempts=0;let caps=0;
 await withInboxUI(<UnifiedInbox token="fixture" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view}:any)=>{
  await act(async()=>facebookButton(view,'选择账号').props.onClick());assert.match(facebookText(view),/正在加载账号/);assert.doesNotMatch(facebookText(view),/暂无账号/);
  await act(async()=>finish(Response.json({message:'fixture error'},{status:503})));assert.match(facebookText(view),/账号目录加载失败/);assert.doesNotMatch(facebookText(view),/暂无账号/);
  await act(async()=>facebookButton(view,'重试加载账号').props.onClick());assert.equal(attempts,2);assert.match(facebookText(view),/Factory Wholesale/);assert.equal(caps,0);
 },url=>{if(url.pathname.endsWith('/accounts')){attempts++;return attempts===1?new Promise(resolve=>{finish=resolve;}):Response.json(inboxPage([inboxAccount]));}if(url.pathname.endsWith('/capabilities'))caps++;});
});

test('picker distinguishes an empty directory from no search matches',async()=>{
 await withInboxUI(<AccountPicker accounts={[]} selectedIds={[]} onApply={()=>{}} onLoadMore={()=>{}}/>,async({view}:any)=>{
  await act(async()=>facebookButton(view,'选择账号').props.onClick());assert.match(facebookText(view),/暂无账号/);
  await act(async()=>view.root.findByProps({'aria-label':'搜索账号'}).props.onChange({target:{value:'missing'}}));assert.match(facebookText(view),/没有匹配的账号/);assert.doesNotMatch(facebookText(view),/暂无账号/);
 });
});

test('picker loading, retry and empty states follow the selected English language',async()=>{
 let retries=0;
 await withInboxUI(<><LanguageToggle/><AccountPicker accounts={[]} selectedIds={[]} loading onApply={()=>{}} onLoadMore={()=>{}}/></>,async({view}:any)=>{
  await act(async()=>facebookButton(view,'English').props.onClick());await act(async()=>facebookButton(view,'选择账号').props.onClick());assert.match(facebookText(view),/Loading accounts/);assert.doesNotMatch(facebookText(view),/正在加载账号/);
 });
 await withInboxUI(<><LanguageToggle/><AccountPicker accounts={[]} selectedIds={[]} loadError="Could not load accounts. Please retry." onRetry={()=>{retries++;}} onApply={()=>{}} onLoadMore={()=>{}}/></>,async({view}:any)=>{
  await act(async()=>facebookButton(view,'English').props.onClick());await act(async()=>facebookButton(view,'选择账号').props.onClick());assert.match(facebookText(view),/Could not load accounts/);assert.doesNotMatch(facebookText(view),/No accounts for/);await act(async()=>facebookButton(view,'Retry loading accounts').props.onClick());assert.equal(retries,1);
 });
 await withInboxUI(<><LanguageToggle/><AccountPicker accounts={[]} selectedIds={[]} onApply={()=>{}} onLoadMore={()=>{}}/></>,async({view}:any)=>{
  await act(async()=>facebookButton(view,'English').props.onClick());await act(async()=>facebookButton(view,'选择账号').props.onClick());assert.match(facebookText(view),/No accounts for this platform/);await act(async()=>view.root.findByProps({'aria-label':'Search accounts'}).props.onChange({target:{value:'missing'}}));assert.match(facebookText(view),/No matching accounts/);
 });
});
