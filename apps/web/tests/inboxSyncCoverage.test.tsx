import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {act} from 'react-test-renderer';
import {withInboxUI,inboxAccount,inboxCase,inboxPage} from './helpers/interactionInboxUI';import {facebookButton,facebookText} from './helpers/facebookManagementUI';import {LanguageToggle} from '../components/LanguageProvider';
test('synced selected records and unfinished history are informational in both languages, not failed reads',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');
 for(const status of ['not_synced','incomplete'])await withInboxUI(<><LanguageToggle/><UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/></>,async({view,requests}:any)=>{
  assert.match(facebookText(view),/当前筛选下已同步 1 条互动/);assert.match(facebookText(view),/历史同步尚未完成/);assert.doesNotMatch(facebookText(view),/部分账号不可用或同步失败/);
  await act(async()=>facebookButton(view,'English').props.onClick());assert.match(facebookText(view),/1 synchronized interaction/);assert.match(facebookText(view),/History synchronization is incomplete/);assert.ok(requests.every((v:any)=>v.method==='GET'));
 },url=>url.pathname.endsWith('/cases')?Response.json({...inboxPage([inboxCase]),accountsStatus:[{accountId:inboxAccount.id,status,count:null,synchronizedCount:1}],partial:true}):undefined);
});
test('existing records do not conceal an error, unavailable account or rate limit',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');
 for(const status of ['error','unavailable','rate_limited'])await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view}:any)=>{
  assert.match(facebookText(view),status==='rate_limited'?/限流/:/部分账号不可用或同步失败/);
 },url=>url.pathname.endsWith('/cases')?Response.json({...inboxPage([inboxCase]),accountsStatus:[{accountId:inboxAccount.id,status,count:null,synchronizedCount:1}],partial:true}):undefined);
});
test('empty or legacy partial results cannot claim selected records synchronized',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');
 for(const synchronizedCount of [undefined,0])await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view}:any)=>{
  assert.doesNotMatch(facebookText(view),/当前筛选下已同步/);assert.match(facebookText(view),/部分账号不可用或同步失败/);
 },url=>url.pathname.endsWith('/cases')?Response.json({...inboxPage([]),accountsStatus:[{accountId:inboxAccount.id,status:'incomplete',count:null,synchronizedCount}],partial:true}):undefined);
});
test('customer panel displays a provided username without inventing a full name',async()=>{
 const {ContactPanel}=await import('../components/inbox/unified/ContactPanel');await withInboxUI(<ContactPanel customer={{id:'customer',version:1,name:null,identities:[{platform:'instagram',name:null,username:'visitor.panel',avatarUrl:null,profileUrl:null,accountId:inboxAccount.id}],tags:[],notes:[],cases:[]}} accountId={inboxAccount.id} tags={[]} canWrite={false} canManage={false} onMutate={async()=>{throw Error('Read-only');}}/>,async({view}:any)=>{
  assert.equal(view.root.findByProps({className:'inbox-customer-profile'}).findByType('strong').children.join(''),'visitor.panel');assert.doesNotMatch(facebookText(view),/平台未提供姓名/);
 });
});
test('successful bounded refresh with a history continuation is not shown as a synchronization failure',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view}:any)=>{
  await act(async()=>facebookButton(view,'立即更新').props.onClick());assert.match(facebookText(view),/历史同步尚未完成/);assert.doesNotMatch(facebookText(view),/部分账号同步未完成/);
 },url=>url.pathname.endsWith('/cases')?Response.json({...inboxPage([inboxCase]),accountsStatus:[{accountId:inboxAccount.id,status:'incomplete',count:null,synchronizedCount:1}],partial:true}):url.pathname.endsWith('/refresh')?Response.json({partial:true,nextCursor:'more-history',results:[{accountId:inboxAccount.id,status:'incomplete'}]}):undefined);
});
