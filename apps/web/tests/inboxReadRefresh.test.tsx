import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {act} from 'react-test-renderer';
import {withInboxUI,inboxCase,inboxAccount,inboxPage} from './helpers/interactionInboxUI';import {facebookButton,facebookText} from './helpers/facebookManagementUI';

test('successful synchronization reloads the open conversation without discarding an unsent reply',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');let synced=false;
 await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view}:any)=>{
  await act(async()=>view.root.findByProps({className:'inbox-case-row'}).props.onClick());await act(async()=>view.root.findByProps({'aria-label':'回复正文'}).props.onChange({target:{value:'keep unfinished reply'}}));
  await act(async()=>facebookButton(view,'立即更新').props.onClick());assert.match(facebookText(view),/Newly synchronized message/);assert.equal(view.root.findByProps({'aria-label':'回复正文'}).props.value,'keep unfinished reply');
 },url=>{if(url.pathname.endsWith('/refresh')){synced=true;return Response.json({partial:false,nextCursor:null});}if(url.pathname.endsWith('/cases/'+inboxCase.id))return Response.json({...inboxCase,items:[{id:'c1',text:synced?'Newly synchronized message':'Old message',inbound:true,occurredAt:new Date().toISOString()}],nextCursor:null,replyTarget:'c1',capabilities:[{capability:'comments.reply',available:true}]});});
});

test('provider-limited list hides stale detail, labels the limit and suspends automatic reads until retry time',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');let limited=false,reads=0,detailReads=0;
 await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view,timers}:any)=>{
  await act(async()=>view.root.findByProps({className:'inbox-case-row'}).props.onClick());const detailBefore=detailReads;limited=true;await act(async()=>facebookButton(view,'重新读取').props.onClick());assert.doesNotMatch(facebookText(view),/Actual fixture comment/);assert.match(facebookText(view),/平台限流/);assert.equal(detailReads,detailBefore);
  const before=reads;await act(async()=>{for(const timer of timers.values())if(timer.ms===30000)timer.callback();});assert.equal(reads,before);
 },url=>{if(url.pathname.endsWith('/cases/'+inboxCase.id))detailReads++;if(url.pathname.endsWith('/cases')){reads++;if(limited)return Response.json({...inboxPage([]),partial:true,accountsStatus:[{accountId:inboxAccount.id,status:'rate_limited',count:null,retryAfter:120}]});}});
});

test('HTTP rate limit pauses both manual and automatic refresh without sending anything',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');let refreshes=0;
 await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view,timers,requests}:any)=>{
  await act(async()=>facebookButton(view,'立即更新').props.onClick());assert.match(facebookText(view),/平台限流/);await act(async()=>{facebookButton(view,'立即更新').props.onClick();for(const timer of timers.values())if(timer.ms===30000)timer.callback();});assert.equal(refreshes,1);assert.ok(!requests.some((x:any)=>x.path.endsWith('/replies')));
 },url=>url.pathname.endsWith('/refresh')?(refreshes++,Response.json({message:'limited',details:{code:'rate_limited'}},{status:429,headers:{'Retry-After':'120'}})):undefined);
});

test('a refresh response arriving after an account switch cannot reopen the old conversation',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');let finish!:(v:Response)=>void;
 await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view}:any)=>{
  await act(async()=>view.root.findByProps({className:'inbox-case-row'}).props.onClick());await act(async()=>{facebookButton(view,'立即更新').props.onClick();});
  (globalThis as any).window.confirm=()=>true;await act(async()=>facebookButton(view,'Instagram').props.onClick());await act(async()=>finish(Response.json({partial:false,nextCursor:null})));assert.doesNotMatch(facebookText(view),/Actual fixture comment/);
 },url=>url.pathname.endsWith('/refresh')?new Promise(resolve=>{finish=resolve;}):url.pathname.endsWith('/accounts')&&url.searchParams.get('platform')==='instagram'?Response.json(inboxPage([])):undefined);
});

test('detail synchronization preserves unknown-send blocking and cannot resend automatically',async()=>{
 const {InteractionDetail}=await import('../components/inbox/unified/InteractionDetail');let reads=0;
 await withInboxUI(<InteractionDetail token="test" workspaceId="w1" item={inboxCase} accountName="Page" canWrite canManage onClose={()=>{}} onDirtyChange={()=>{}} onUpdated={()=>{}} onAccessDenied={()=>{}}/>,async({view,requests}:any)=>{
  assert.equal(facebookButton(view,'发送公开回复').props.disabled,true);await act(async()=>facebookButton(view,'刷新详情').props.onClick());assert.ok(reads>=2);assert.equal(facebookButton(view,'发送公开回复').props.disabled,true);assert.ok(!requests.some((x:any)=>x.path.endsWith('/replies')));
 },url=>url.pathname.endsWith('/cases/'+inboxCase.id)?(reads++,Response.json({...inboxCase,items:[],replyTarget:'c1',nextCursor:null,pendingSend:{requestKey:'unknown',status:'unknown',createdAt:new Date().toISOString(),diagnosticId:null},capabilities:[{capability:'comments.reply',available:true}]})):undefined);
});

test('automatic synchronization resumes after cooldown instead of permanently disabling the inbox',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');const originalNow=Date.now;let now=originalNow(),refreshes=0;Date.now=()=>now;
 try{await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view,timers}:any)=>{
  await act(async()=>facebookButton(view,'立即更新').props.onClick());const before=refreshes;await act(async()=>{for(const timer of timers.values())if(timer.ms===30000)timer.callback();});assert.equal(refreshes,before);now+=121000;await act(async()=>{for(const timer of timers.values())if(timer.ms===30000)timer.callback();});assert.equal(refreshes,2);
 },url=>url.pathname.endsWith('/refresh')?(++refreshes===1?Response.json({details:{code:'rate_limited'}},{status:429,headers:{'Retry-After':'120'}}):Response.json({partial:false,nextCursor:null})):undefined);}finally{Date.now=originalNow;}
});

test('a first-open capability limit recovers the directory without requiring any account to be selected',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');const originalNow=Date.now;let now=originalNow(),limited=true;Date.now=()=>now;
 try{await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view,timers}:any)=>{
  assert.match(facebookText(view),/平台限流/);limited=false;now+=121000;await act(async()=>{for(const timer of timers.values())if(timer.ms===30000)timer.callback();});assert.equal(view.root.findAllByProps({className:'inbox-case-row'}).length,1);
 },url=>url.pathname.endsWith('/accounts')?Response.json(inboxPage([{...inboxAccount,capabilities:[]}])):url.pathname.endsWith('/capabilities')?Response.json({accounts:[limited?{accountId:inboxAccount.id,capabilities:[],reason:'rate_limited',retryAfter:120}:{accountId:inboxAccount.id,capabilities:inboxAccount.capabilities}]}):undefined);}finally{Date.now=originalNow;}
});

test('a limit while reloading an open detail hides unverified old messages and reports cooldown',async()=>{
 const {InteractionDetail}=await import('../components/inbox/unified/InteractionDetail');let limited=false;
 await withInboxUI(<InteractionDetail token="test" workspaceId="w1" item={inboxCase} accountName="Page" canWrite canManage onClose={()=>{}} onDirtyChange={()=>{}} onUpdated={()=>{}} onAccessDenied={()=>{}}/>,async({view}:any)=>{
  assert.match(facebookText(view),/Actual fixture comment/);limited=true;await act(async()=>facebookButton(view,'刷新详情').props.onClick());assert.doesNotMatch(facebookText(view),/Actual fixture comment/);assert.match(facebookText(view),/平台限流/);
 },url=>limited&&url.pathname.endsWith('/cases/'+inboxCase.id)?Response.json({details:{code:'rate_limited'}},{status:429,headers:{'Retry-After':'120'}}):undefined);
});

test('detail reload respects its retry delay before allowing another provider read',async()=>{
 const {InteractionDetail}=await import('../components/inbox/unified/InteractionDetail');let limited=false,reads=0;const originalNow=Date.now;let now=originalNow();Date.now=()=>now;
 try{await withInboxUI(<InteractionDetail token="test" workspaceId="w1" item={inboxCase} accountName="Page" canWrite canManage onClose={()=>{}} onDirtyChange={()=>{}} onUpdated={()=>{}} onAccessDenied={()=>{}}/>,async({view}:any)=>{
  limited=true;await act(async()=>facebookButton(view,'刷新详情').props.onClick());const before=reads;await act(async()=>facebookButton(view,'刷新详情').props.onClick());assert.equal(reads,before);limited=false;now+=121000;await act(async()=>facebookButton(view,'刷新详情').props.onClick());assert.equal(reads,before+1);assert.match(facebookText(view),/Actual fixture comment/);
 },url=>{if(url.pathname.endsWith('/cases/'+inboxCase.id)){reads++;if(limited)return Response.json({details:{code:'rate_limited'}},{status:429,headers:{'Retry-After':'120'}});}});}finally{Date.now=originalNow;}
});

test('transient read limits preserve local reply and note drafts while hiding old customer messages and blocking writes',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');let limited=false;
 await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view,requests}:any)=>{
  const note=()=>view.root.findAllByType('textarea').find((n:any)=>n.props['aria-label']==='内部备注');
  await act(async()=>view.root.findByProps({className:'inbox-case-row'}).props.onClick());await act(async()=>view.root.findByProps({'aria-label':'回复正文'}).props.onChange({target:{value:'local reply draft'}}));await act(async()=>note().props.onChange({target:{value:'local note draft'}}));limited=true;
  await act(async()=>facebookButton(view,'立即更新').props.onClick());assert.doesNotMatch(facebookText(view),/Actual fixture comment/);assert.equal(view.root.findByProps({'aria-label':'回复正文'}).props.value,'local reply draft');assert.equal(note().props.value,'local note draft');assert.equal(facebookButton(view,'发送公开回复').props.disabled,true);assert.ok(!requests.some((x:any)=>x.path.endsWith('/replies')));
 },url=>limited&&url.pathname.endsWith('/refresh')?Response.json({details:{code:'rate_limited'}},{status:429,headers:{'Retry-After':'120'}}):undefined);
});

test('partial multiaccount rate limits pause before more list or detail reads despite HTTP 200',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');const second={...inboxAccount,id:'44444444-4444-4444-8444-444444444444',name:'Other Page'};let lists=0,refreshes=0;
 await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/>,async({view,timers}:any)=>{
  const before=lists;await act(async()=>facebookButton(view,'立即更新').props.onClick());assert.match(facebookText(view),/平台限流/);assert.equal(lists,before);await act(async()=>{for(const timer of timers.values())if(timer.ms===30000)timer.callback();});assert.equal(refreshes,1);
 },url=>{if(url.pathname.endsWith('/accounts'))return Response.json(inboxPage([inboxAccount,second]));if(url.pathname.endsWith('/capabilities'))return Response.json({accounts:[inboxAccount,second].map(a=>({accountId:a.id,capabilities:a.capabilities}))});if(url.pathname.endsWith('/cases')){lists++;return Response.json({...inboxPage([inboxCase]),accountsStatus:[{accountId:inboxAccount.id,status:'ok',count:1},{accountId:second.id,status:'ok',count:0}]});}if(url.pathname.endsWith('/refresh')){refreshes++;return Response.json({partial:true,nextCursor:null,results:[{accountId:inboxAccount.id,status:'ok'},{accountId:second.id,status:'rate_limited',retryAfter:120}]});}});
});
