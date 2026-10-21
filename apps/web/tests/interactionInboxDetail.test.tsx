import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {act} from 'react-test-renderer';import {withInboxUI,inboxCase} from './helpers/interactionInboxUI';import {facebookButton,facebookText} from './helpers/facebookManagementUI';

test('successful reply reloads same-case detail and displays confirmed reply with replied badge',async()=>{
 const {InteractionDetail}=await import('../components/inbox/unified/InteractionDetail');let sent=false,reads=0;
 await withInboxUI(<InteractionDetail token="test" workspaceId="w1" item={inboxCase as any} accountName="Page" canWrite canManage onClose={()=>{}} onDirtyChange={()=>{}} onUpdated={()=>{}} onAccessDenied={()=>{}}/>,async({view}:any)=>{
  await act(async()=>view.root.findByProps({'aria-label':'回复正文'}).props.onChange({target:{value:'Confirmed page reply'}}));
  await act(async()=>facebookButton(view,'发送公开回复').props.onClick());assert.ok(reads>=2);assert.match(facebookText(view),/Confirmed page reply/);assert.match(facebookText(view),/已回复/);
 },url=>{if(url.pathname.endsWith('/replies')){sent=true;return Response.json({status:'sent',providerId:'r1'});}if(url.pathname.endsWith('/cases/'+inboxCase.id)){reads++;return Response.json({...inboxCase,replied:sent,items:[{id:'c1',text:'Question',inbound:true,occurredAt:new Date().toISOString()},...(sent?[{id:'r1',text:'Confirmed page reply',inbound:false,occurredAt:new Date().toISOString()}]:[])],nextCursor:null,replyTarget:'c1',capabilities:[{capability:'comments.reply',available:true}]});}});
});

test('same-case reload preserves unfinished internal input while customer data loads',async()=>{
 const {InteractionDetail}=await import('../components/inbox/unified/InteractionDetail');let reads=0,finish!:(r:Response)=>void;
 await withInboxUI(<InteractionDetail token="test" workspaceId="w1" item={inboxCase as any} accountName="Page" canWrite canManage onClose={()=>{}} onDirtyChange={()=>{}} onUpdated={()=>{}} onAccessDenied={()=>{}}/>,async({view}:any)=>{
  await act(async()=>view.root.findAllByType('textarea').find((n:any)=>n.props['aria-label']==='内部备注').props.onChange({target:{value:'unfinished private note'}}));
  await act(async()=>facebookButton(view,'刷新详情').props.onClick());assert.match(facebookText(view),/unfinished private note/);
  await act(async()=>finish(Response.json({id:inboxCase.customerId,version:1,name:'Customer',identities:[],tags:[],notes:[],cases:[]})));
 },url=>url.pathname.includes('/customers/')&&++reads>1?new Promise(resolve=>{finish=resolve;}):undefined);
});

test('late successful send cannot restore the previous platform list',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');let finish!:(r:Response)=>void;
 await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view}:any)=>{
  await act(async()=>view.root.findByProps({className:'inbox-case-row'}).props.onClick());
  await act(async()=>view.root.findByProps({'aria-label':'回复正文'}).props.onChange({target:{value:'reply'}}));
  await act(async()=>{void facebookButton(view,'发送公开回复').props.onClick();});
  (globalThis as any).window.confirm=()=>true;await act(async()=>facebookButton(view,'Instagram').props.onClick());
  await act(async()=>finish(Response.json({status:'sent'})));assert.doesNotMatch(facebookText(view),/Customer One|Actual fixture comment/);
 },url=>url.pathname.endsWith('/replies')?new Promise(resolve=>{finish=resolve;}):undefined);
});

test('partial account access loss clears loaded bodies and drafts',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');let lost=false;
 await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view}:any)=>{
  await act(async()=>view.root.findByProps({className:'inbox-case-row'}).props.onClick());
  await act(async()=>view.root.findByProps({'aria-label':'回复正文'}).props.onChange({target:{value:'private draft'}}));lost=true;
  await act(async()=>facebookButton(view,'重新读取').props.onClick());assert.doesNotMatch(facebookText(view),/Actual fixture comment|private draft/);
 },url=>lost&&url.pathname.endsWith('/cases')?Response.json({items:[],nextCursor:null,partial:true,accountsStatus:[{accountId:inboxCase.accountId,status:'unavailable'}]}):undefined);
});
test('replyAndInternalNoteCannotShareAction and unknown sends never auto-retry',async()=>{
 const m=await import('../components/inbox/unified/ReplyComposer').catch(()=>null);assert.ok(m,'reply composer required');let sends=0;
 await withInboxUI(<m.ReplyComposer detail={{...inboxCase,items:[],nextCursor:null,officialUrl:'https://www.facebook.com/100_1',replyTarget:'c1',capabilities:[{capability:'comments.reply',available:true,reason:'available',verifiedAt:null}]}} accountName="Factory Wholesale" canWrite onSend={async()=>{sends++;return{status:'unknown',diagnosticId:'synthetic'};}} onDirtyChange={()=>{}} onAcknowledge={async()=>{}}/>,async({view}:any)=>{
  assert.match(facebookText(view),/Factory Wholesale/);await act(async()=>view.root.findByProps({'aria-label':'回复正文'}).props.onChange({target:{value:'public reply'}}));await act(async()=>facebookButton(view,'发送公开回复').props.onClick());assert.equal(sends,1);assert.match(facebookText(view),/不会自动重发/);assert.equal(facebookButton(view,'发送公开回复').props.disabled,true);
 });
});
test('detail context loads the next opaque page without changing the reply target',async()=>{
 const m=await import('../components/inbox/unified/InteractionDetail');await withInboxUI(<m.InteractionDetail token="test" workspaceId="w1" item={inboxCase as any} accountName="Factory Wholesale" canWrite canManage onClose={()=>{}} onDirtyChange={()=>{}} onUpdated={()=>{}} onAccessDenied={()=>{}}/>,async({view}:any)=>{
  const button=facebookButton(view,'加载更多上下文');assert.ok(button,'context pagination control required');await act(async()=>button.props.onClick());assert.match(facebookText(view),/Earlier context/);
 },url=>url.pathname.endsWith('/cases/'+inboxCase.id)?Response.json({...inboxCase,items:[{id:url.searchParams.has('cursor')?'older':'first',text:url.searchParams.has('cursor')?'Earlier context':'Recent context',inbound:true,occurredAt:new Date().toISOString()}],nextCursor:url.searchParams.has('cursor')?null:'opaque-page-token',officialUrl:null,replyTarget:'c1',capabilities:[]}):undefined);
});
test('real inbox opens details and protects an unsent draft on platform switches',async()=>{
 const m=await import('../components/inbox/unified/UnifiedInbox');await withInboxUI(<m.UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view}:any)=>{
  await act(async()=>view.root.findByProps({className:'inbox-case-row'}).props.onClick());assert.match(facebookText(view),/Actual fixture comment/);
  await act(async()=>view.root.findByProps({'aria-label':'回复正文'}).props.onChange({target:{value:'retain draft'}}));(globalThis as any).window.confirm=()=>false;await act(async()=>facebookButton(view,'Instagram').props.onClick());assert.match(facebookText(view),/retain draft/);
  (globalThis as any).window.confirm=()=>true;await act(async()=>facebookButton(view,'Instagram').props.onClick());assert.doesNotMatch(facebookText(view),/retain draft|Actual fixture comment/);
 });
});
