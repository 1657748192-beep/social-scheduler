import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {act} from 'react-test-renderer';
import {withInboxUI,inboxCase} from './helpers/interactionInboxUI';import {facebookButton,facebookText} from './helpers/facebookManagementUI';
const messageCase={...inboxCase,kind:'messages' as const};
const msg=(id:string,minute:number,inbound=true,text=id)=>({id,text,inbound,occurredAt:`2026-10-21T12:${String(minute).padStart(2,'0')}:00.000Z`});
const detail=(items:any[],nextCursor:string|null='history-1')=>({...messageCase,items,nextCursor,officialUrl:null,replyTarget:'conversation-1',replied:true,capabilities:[{capability:'messages.reply',available:true,reason:'available',verifiedAt:null}]});
async function component(){const {InteractionDetail}=await import('../components/inbox/unified/InteractionDetail');return <InteractionDetail token="test" workspaceId="w1" item={messageCase} accountName="Factory Wholesale" canWrite canManage onClose={()=>{}} onDirtyChange={()=>{}} onUpdated={()=>{}} onAccessDenied={()=>{}}/>;}
const rows=(view:any)=>view.root.findAllByType('article').filter((n:any)=>n.props.className==='inbox-message');
test('private messages render oldest first with distinct customer and Page sides, full timestamp and history above messages',async()=>{
 await withInboxUI(await component(),async({view}:any)=>{
  assert.deepEqual(rows(view).map((n:any)=>n.props['data-message-id']),['question','reply']);
  assert.deepEqual(rows(view).map((n:any)=>n.props['data-inbound']),[true,false]);
  assert.equal(view.root.findByProps({role:'log'}).props['aria-label'],'私信对话');
  const time=rows(view)[0].findByType('time');assert.equal(time.props.dateTime,'2026-10-21T12:01:00.000Z');assert.ok(time.props.title);
  assert.ok(facebookText(view).indexOf('加载更早消息')<facebookText(view).indexOf('question'));
 },url=>url.pathname.endsWith('/cases/'+inboxCase.id)?Response.json(detail([msg('reply',2,false),msg('question',1)])):undefined);
});
test('older message pages deduplicate without overwriting current reply target or replied status; refresh retains history and unsent draft',async()=>{
 let refresh=false;const {ReplyComposer}=await import('../components/inbox/unified/ReplyComposer');
 await withInboxUI(await component(),async({view,requests}:any)=>{
  await act(async()=>view.root.findByProps({'aria-label':'回复正文'}).props.onChange({target:{value:'Keep this draft'}}));
  await act(async()=>facebookButton(view,'加载更早消息').props.onClick());
  assert.deepEqual(rows(view).map((n:any)=>n.props['data-message-id']),['old','question','reply']);
  assert.equal(view.root.findByType(ReplyComposer).props.detail.replyTarget,'conversation-1');
  assert.equal(view.root.findByType(ReplyComposer).props.detail.capabilities[0].capability,'messages.reply');
  assert.match(facebookText(view),/已回复/);assert.match(facebookText(view),/Keep this draft/);
  refresh=true;await act(async()=>facebookButton(view,'刷新详情').props.onClick());
  assert.deepEqual(rows(view).map((n:any)=>n.props['data-message-id']),['old','question','reply','new']);
  assert.equal(facebookButton(view,'加载更早消息'),undefined,'exhausted older cursor is not replaced by latest-page cursor');
  assert.match(facebookText(view),/Keep this draft/);assert.equal(requests.filter((r:any)=>r.method!=='GET').length,0);
 },url=>url.pathname.endsWith('/cases/'+inboxCase.id)?Response.json(url.searchParams.has('cursor')?{...detail([msg('question',1),msg('old',0)],null),replied:false,replyTarget:'stale-target',capabilities:[]}:detail(refresh?[msg('new',3),msg('reply',2,false),msg('question',1)]:[msg('reply',2,false),msg('question',1)])):undefined);
});
test('a failed older-page read keeps existing conversation, draft and retry control',async()=>{
 await withInboxUI(await component(),async({view}:any)=>{
  await act(async()=>view.root.findByProps({'aria-label':'回复正文'}).props.onChange({target:{value:'Unsent'}}));
  await act(async()=>facebookButton(view,'加载更早消息').props.onClick());
  assert.deepEqual(rows(view).map((n:any)=>n.props['data-message-id']),['question','reply']);
  assert.match(facebookText(view),/Unsent/);assert.ok(facebookButton(view,'加载更早消息'));assert.match(facebookText(view),/读取失败/);
 },url=>url.pathname.endsWith('/cases/'+inboxCase.id)?url.searchParams.has('cursor')?Response.json({message:'synthetic failure'},{status:500}):Response.json(detail([msg('reply',2,false),msg('question',1)])):undefined);
});
test('a disjoint refreshed message window keeps the fresh cursor so intervening messages remain reachable',async()=>{
 let refreshed=false;
 await withInboxUI(await component(),async({view}:any)=>{
  assert.deepEqual(rows(view).map((n:any)=>n.props['data-message-id']),['old']);
  refreshed=true;await act(async()=>facebookButton(view,'刷新详情').props.onClick());
  assert.ok(facebookButton(view,'加载更早消息'));
  await act(async()=>facebookButton(view,'加载更早消息').props.onClick());
  assert.deepEqual(rows(view).map((n:any)=>n.props['data-message-id']),['middle','new']);
 },url=>url.pathname.endsWith('/cases/'+inboxCase.id)?Response.json(url.searchParams.has('cursor')?detail([msg('middle',2)],null):refreshed?detail([msg('new',3)],'bridge'):detail([msg('old',1)],null)):undefined);
});
test('an authoritative empty refresh removes old message bodies without clearing an unsent draft',async()=>{
 let empty=false;
 await withInboxUI(await component(),async({view}:any)=>{
  await act(async()=>view.root.findByProps({'aria-label':'回复正文'}).props.onChange({target:{value:'Private draft'}}));
  empty=true;await act(async()=>facebookButton(view,'刷新详情').props.onClick());
  assert.equal(rows(view).length,0);assert.doesNotMatch(facebookText(view),/old-body/);assert.match(facebookText(view),/Private draft/);
 },url=>url.pathname.endsWith('/cases/'+inboxCase.id)?Response.json(detail(empty?[]:[msg('old-body',1)],null)):undefined);
});
test('a late history response cannot restore bodies after a newer empty refresh',async()=>{
 let empty=false,finish!:(value:Response)=>void;
 await withInboxUI(await component(),async({view}:any)=>{
  await act(async()=>{facebookButton(view,'加载更早消息').props.onClick();});
  empty=true;await act(async()=>facebookButton(view,'刷新详情').props.onClick());assert.equal(rows(view).length,0);
  await act(async()=>finish(Response.json(detail([msg('old-body',0)],null))));assert.equal(rows(view).length,0);
 },url=>url.pathname.endsWith('/cases/'+inboxCase.id)?url.searchParams.has('cursor')?new Promise(resolve=>{finish=resolve;}):Response.json(detail(empty?[]:[msg('question',1)])):undefined);
});
test('history started during a pending refresh cannot replace the authoritative new cursor',async()=>{
 let refreshing=false,finishRefresh!:(value:Response)=>void,finishHistory!:(value:Response)=>void;
 await withInboxUI(await component(),async({view}:any)=>{
  refreshing=true;await act(async()=>facebookButton(view,'刷新详情').props.onClick());
  await act(async()=>facebookButton(view,'加载更早消息').props.onClick());
  await act(async()=>finishRefresh(Response.json(detail([msg('new-window',10)],'new-cursor'))));
  await act(async()=>finishHistory(Response.json(detail([msg('stale-history',0)],null))));
  assert.deepEqual(rows(view).map((n:any)=>n.props['data-message-id']),['new-window']);assert.ok(facebookButton(view,'加载更早消息'));
 },url=>url.pathname.endsWith('/cases/'+inboxCase.id)?url.searchParams.has('cursor')?new Promise(resolve=>{finishHistory=resolve;}):refreshing?new Promise(resolve=>{finishRefresh=resolve;}):Response.json(detail([msg('old-window',1)])):undefined);
});
test('a complete refreshed history drops messages no longer returned by the authoritative source',async()=>{
 let refreshed=false;
 await withInboxUI(await component(),async({view}:any)=>{
  refreshed=true;await act(async()=>facebookButton(view,'刷新详情').props.onClick());
  assert.deepEqual(rows(view).map((n:any)=>n.props['data-message-id']),['still-visible']);
 },url=>url.pathname.endsWith('/cases/'+inboxCase.id)?Response.json(detail(refreshed?[msg('still-visible',2)]:[msg('expired-body',1),msg('still-visible',2)],null)):undefined);
});
