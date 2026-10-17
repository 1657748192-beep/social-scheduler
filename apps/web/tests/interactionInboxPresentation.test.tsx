import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {act} from 'react-test-renderer';
import {withInboxUI,inboxCase} from './helpers/interactionInboxUI';
import {facebookButton,facebookText} from './helpers/facebookManagementUI';

test('customer search belongs to the list while all three top-level interaction tabs remain available',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');
 await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view}:any)=>{
  const list=view.root.findByProps({'aria-label':'互动列表'});
  assert.equal(list.findAllByProps({'aria-label':'搜索客户'}).length,1);
  const tabs=view.root.findAllByProps({role:'tablist'}).find((n:any)=>n.props['aria-label']==='互动类型');
  assert.ok(tabs);assert.equal(tabs.findAllByProps({role:'tab'}).length,3);
  const filter=facebookButton(view,'更多筛选');assert.ok(filter);await act(async()=>filter.props.onClick());
  assert.equal(view.root.findByProps({'aria-label':'高级筛选'}).props.hidden,false);
  assert.equal(tabs.findAllByProps({role:'tab'}).length,3);
 });
});

test('central internal-note composer never calls the public reply endpoint',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');
 await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view,requests}:any)=>{
  await act(async()=>view.root.findByProps({className:'inbox-case-row'}).props.onClick());
  const detail=view.root.findByProps({className:'inbox-detail'});
  const noteTab=detail.findAllByProps({role:'tab'}).find((n:any)=>n.props['aria-label']==='内部备注');assert.ok(noteTab);
  await act(async()=>noteTab.props.onClick());
  const textarea=detail.findAllByType('textarea').find((n:any)=>n.props['aria-label']==='内部备注');await act(async()=>textarea.props.onChange({target:{value:'private wholesale note'}}));
  await act(async()=>facebookButton(view,'保存内部备注').props.onClick());
  const writes=requests.filter((r:any)=>r.method!=='GET');assert.deepEqual(writes.map((r:any)=>({path:r.path,body:r.body})),[{path:'/api/v1/workspaces/w1/interaction-inbox/customers/'+inboxCase.customerId+'/notes',body:{text:'private wholesale note'}}]);
  assert.match(facebookText(view),/内部/);
 });
});
