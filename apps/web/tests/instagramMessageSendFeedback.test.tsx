import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {act} from 'react-test-renderer';
import {withInboxUI,inboxCase,inboxAccount,inboxPage,inboxResponse} from './helpers/interactionInboxUI';import {facebookButton,facebookText,withFacebookUI} from './helpers/facebookManagementUI';
import {LanguageToggle,LanguageProvider} from '../components/LanguageProvider';
const item={...inboxCase,kind:'messages' as const,sourceLabel:'instagram'},text='Social Scheduler Instagram messaging reply test REC2. This reply is for app review demonstration only.';
const inbound={id:'incoming-rec2',text:'SS-IG-DM-1023-REC2 review demo',inbound:true,occurredAt:new Date(Date.now()-60000).toISOString()};
const outbound={id:'confirmed-rec2',text,inbound:false,occurredAt:new Date().toISOString()};
function detail(sent=false){return{...item,replied:sent,items:sent?[inbound,outbound]:[inbound],nextCursor:null,officialUrl:null,replyTarget:'conversation-rec2',pendingSend:null,recordingReply:{text,state:sent?'used':'available',expiresAt:new Date(Date.now()+3600000).toISOString()},capabilities:[{capability:'messages.reply',available:true,reason:'available',verifiedAt:null}]};}
async function component(extra:Record<string,unknown>={}){const {InteractionDetail}=await import('../components/inbox/unified/InteractionDetail');return <><LanguageToggle/><InteractionDetail {...({token:'test',workspaceId:'w1',item,platform:'instagram',accountName:'MOOYAM-factory',canWrite:true,canManage:true,onClose:()=>{},onDirtyChange:()=>{},onUpdated:()=>{},onAccessDenied:()=>{},...extra} as any)}/></>;}
const replies=(view:any)=>view.root.findAllByType('article').filter((n:any)=>n.props.className==='inbox-message'&&n.props['data-inbound']===false);

test('Instagram message shows sending immediately, then confirmed right-side bubble before a delayed detail refresh',async()=>{
 let releaseSend!:(r:Response)=>void,releaseRead!:(r:Response)=>void,started=false,sends=0;
 await withInboxUI(await component(),async({view}:any)=>{
  await act(async()=>{facebookButton(view,'发送私信').props.onClick();});
  assert.equal(sends,1);assert.equal(replies(view).length,0);assert.match(facebookText(view),/正在发送/);assert.equal(facebookButton(view,'发送中…').props.disabled,true);
  await act(async()=>facebookButton(view,'English').props.onClick());assert.match(facebookText(view),/Sending/);
  await act(async()=>releaseSend(Response.json({status:'sent',providerId:'confirmed-rec2'})));
  assert.equal(replies(view).length,1);assert.equal(replies(view)[0].props['data-message-id'],'confirmed-rec2');assert.equal(replies(view)[0].findByType('p').children.join(''),text);assert.match(facebookText(view),/Replied/);
  assert.equal(facebookButton(view,'Send message').props.disabled,true);await act(async()=>facebookButton(view,'Send message').props.onClick());assert.equal(sends,1);
  await act(async()=>releaseRead(Response.json(detail(true))));assert.equal(replies(view).length,1);assert.equal(sends,1);
 },url=>url.pathname.endsWith('/replies')?(sends++,started=true,new Promise(resolve=>{releaseSend=resolve;})):url.pathname.endsWith('/cases/'+item.id)?started?new Promise(resolve=>{releaseRead=resolve;}):Response.json(detail()):undefined);
});

test('failed post-send refresh retains the confirmed bubble and success, labels refresh failure in both languages, never retries send',async()=>{
 let sent=false,sends=0;
 await withInboxUI(await component(),async({view}:any)=>{
  await act(async()=>facebookButton(view,'发送私信').props.onClick());assert.equal(replies(view).length,1);assert.match(facebookText(view),/回复已发送.*刷新失败/);assert.match(facebookText(view),/平台已确认发送成功/);assert.doesNotMatch(facebookText(view),/发送结果未知/);
  await act(async()=>facebookButton(view,'English').props.onClick());assert.match(facebookText(view),/reply was sent.*refresh failed/i);assert.equal(facebookButton(view,'Send message').props.disabled,true);assert.equal(sends,1);
 },url=>url.pathname.endsWith('/replies')?(sent=true,sends++,Response.json({status:'sent',providerId:'confirmed-rec2'})):url.pathname.endsWith('/cases/'+item.id)?sent?Response.json({message:'read unavailable'},{status:500}):Response.json(detail()):undefined);
});

for(const outcome of [{status:'unknown',diagnosticId:'one'},{status:'failed',code:'provider_rejected',diagnosticId:'one'},{status:'sent',providerId:'historical-receipt',replayed:true}])test(`message ${outcome.status}${'replayed' in outcome?' replay':''} never invents a newly sent bubble`,async()=>{
 let sends=0;await withInboxUI(await component(),async({view}:any)=>{await act(async()=>facebookButton(view,'发送私信').props.onClick());assert.equal(replies(view).length,0);assert.equal(facebookButton(view,'发送私信').props.disabled,true);assert.equal(sends,1);},url=>url.pathname.endsWith('/replies')?(sends++,Response.json(outcome)):url.pathname.endsWith('/cases/'+item.id)?Response.json(detail()):undefined);
});

test('a list-refresh callback failure cannot relabel an acknowledged Instagram send as unknown',async()=>{
 let sent=false;await withInboxUI(await component({onUpdated:()=>{throw Error('list refresh failed');}}),async({view}:any)=>{await act(async()=>facebookButton(view,'发送私信').props.onClick());assert.equal(replies(view).length,1);assert.match(facebookText(view),/平台已确认发送成功/);assert.doesNotMatch(facebookText(view),/发送结果未知/);},url=>url.pathname.endsWith('/replies')?(sent=true,Response.json({status:'sent',providerId:'confirmed-rec2'})):url.pathname.endsWith('/cases/'+item.id)?Response.json(detail(sent)):undefined);
});

test('a successful authoritative empty refresh removes the immediate receipt bubble instead of reviving deleted content',async()=>{
 let sent=false;await withInboxUI(await component(),async({view}:any)=>{await act(async()=>facebookButton(view,'发送私信').props.onClick());assert.equal(replies(view).length,0);},url=>url.pathname.endsWith('/replies')?(sent=true,Response.json({status:'sent',providerId:'confirmed-rec2'})):url.pathname.endsWith('/cases/'+item.id)?Response.json(sent?{...detail(true),items:[]}:detail()):undefined);
});

test('permission denial while send is pending prevents a late receipt from restoring private chat bodies',async()=>{
 let release!:(r:Response)=>void,denied=false;
 await withInboxUI(await component(),async({view}:any)=>{
  await act(async()=>{facebookButton(view,'发送私信').props.onClick();});denied=true;await act(async()=>facebookButton(view,'刷新详情').props.onClick());assert.doesNotMatch(facebookText(view),/SS-IG-DM-1023-REC2/);
  await act(async()=>release(Response.json({status:'sent',providerId:'confirmed-rec2'})));assert.equal(replies(view).length,0);assert.doesNotMatch(facebookText(view),/SS-IG-DM-1023-REC2/);
 },url=>url.pathname.endsWith('/replies')?new Promise(resolve=>{release=resolve;}):url.pathname.endsWith('/cases/'+item.id)?denied?Response.json({message:'forbidden'},{status:403}):Response.json(detail()):undefined);
});

test('the real inbox passes Instagram account identity through to immediate message confirmation',async()=>{
 const {UnifiedInbox}=await import('../components/inbox/unified/UnifiedInbox');let sent=false,finish!:(r:Response)=>void;
 const account={...inboxAccount,platform:'instagram',capabilities:[{capability:'messages.read',available:true,reason:'available',verifiedAt:null}]};
 await withInboxUI(<UnifiedInbox token="test" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any} initialPlatform="instagram" initialKind="messages"/>,async({view}:any)=>{
  await act(async()=>view.root.findByProps({className:'inbox-case-row'}).props.onClick());await act(async()=>facebookButton(view,'发送私信').props.onClick());assert.equal(replies(view).length,1);await act(async()=>finish(Response.json(detail(true))));
 },url=>url.pathname.endsWith('/accounts')?Response.json(inboxPage([account])):url.pathname.endsWith('/capabilities')?Response.json({accounts:[{accountId:account.id,capabilities:account.capabilities}]}):url.pathname.endsWith('/cases')?Response.json(inboxPage([item])):url.pathname.endsWith('/replies')?(sent=true,Response.json({status:'sent',providerId:'confirmed-rec2'})):url.pathname.endsWith('/cases/'+item.id)?sent?new Promise(resolve=>{finish=resolve;}):Response.json(detail()):undefined);
});

test('a detail read started before acknowledgement cannot erase the immediate confirmed message',async()=>{
 let send!:(r:Response)=>void,stale!:(r:Response)=>void,fresh!:(r:Response)=>void,reads=0;
 await withInboxUI(await component(),async({view}:any)=>{
  await act(async()=>facebookButton(view,'发送私信').props.onClick());await act(async()=>facebookButton(view,'刷新详情').props.onClick());
  await act(async()=>send(Response.json({status:'sent',providerId:'confirmed-rec2'})));assert.equal(replies(view).length,1);
  await act(async()=>stale(Response.json({...detail(),items:[]})));assert.equal(replies(view).length,1);
  await act(async()=>fresh(Response.json(detail(true))));assert.equal(replies(view).length,1);
 },url=>url.pathname.endsWith('/replies')?new Promise(resolve=>{send=resolve;}):url.pathname.endsWith('/cases/'+item.id)?++reads===1?Response.json(detail()):reads===2?new Promise(resolve=>{stale=resolve;}):new Promise(resolve=>{fresh=resolve;}):undefined);
});

test('an authoritative deleted reply replaces its immediate bubble without restoring submitted text',async()=>{
 let sent=false;await withInboxUI(await component(),async({view}:any)=>{await act(async()=>facebookButton(view,'发送私信').props.onClick());assert.equal(replies(view).length,1);assert.equal(replies(view)[0].findByType('p').children.join(''),'此内容已删除');},url=>url.pathname.endsWith('/replies')?(sent=true,Response.json({status:'sent',providerId:'confirmed-rec2'})):url.pathname.endsWith('/cases/'+item.id)?Response.json(sent?{...detail(true),items:[inbound,{...outbound,text:null,deleted:true}]}:detail()):undefined);
});

test('a late Instagram receipt cannot appear after switching the authenticated account context',async()=>{
 let finish!:(r:Response)=>void,other=false,updates=0;const onUpdated=()=>{updates++;},otherItem={...item,accountId:'44444444-4444-4444-8444-444444444444'};
 await withInboxUI(await component({onUpdated}),async({view}:any)=>{
  await act(async()=>facebookButton(view,'发送私信').props.onClick());other=true;
  const next=await component({item:otherItem,onUpdated});await act(async()=>view.update(<LanguageProvider>{next}</LanguageProvider>));
  await act(async()=>finish(Response.json({status:'sent',providerId:'confirmed-rec2'})));assert.equal(replies(view).length,0);assert.equal(updates,0);
 },url=>url.pathname.endsWith('/replies')?new Promise(resolve=>{finish=resolve;}):url.pathname.endsWith('/cases/'+item.id)?Response.json(other?{...detail(),...otherItem,items:[{...inbound,id:'other-inbound',text:'Other account message'}]}:detail()):undefined);
});

test('rate limiting while send is pending keeps private bodies hidden after a late successful receipt',async()=>{
 let finish!:(r:Response)=>void,limited=false,updates=0;
 await withInboxUI(await component({onUpdated:()=>{updates++;}}),async({view}:any)=>{
  await act(async()=>facebookButton(view,'发送私信').props.onClick());limited=true;await act(async()=>facebookButton(view,'刷新详情').props.onClick());assert.doesNotMatch(facebookText(view),/SS-IG-DM-1023-REC2/);
  await act(async()=>finish(Response.json({status:'sent',providerId:'confirmed-rec2'})));assert.equal(replies(view).length,0);assert.doesNotMatch(facebookText(view),/SS-IG-DM-1023-REC2/);assert.equal(updates,0);
 },url=>url.pathname.endsWith('/replies')?new Promise(resolve=>{finish=resolve;}):url.pathname.endsWith('/cases/'+item.id)?limited?Response.json({details:{code:'rate_limited'}},{status:429,headers:{'Retry-After':'120'}}):Response.json(detail()):undefined);
});

for(const providerId of [undefined,'../../invalid'])test(`a sent response with ${providerId===undefined?'missing':'invalid'} receipt stays unconfirmed and cannot create a bubble`,async()=>{
 let sends=0;await withInboxUI(await component(),async({view}:any)=>{await act(async()=>facebookButton(view,'发送私信').props.onClick());assert.equal(replies(view).length,0);assert.doesNotMatch(facebookText(view),/平台已确认发送成功/);assert.match(facebookText(view),/发送结果未知/);assert.equal(facebookButton(view,'发送私信').props.disabled,true);assert.equal(sends,1);},url=>url.pathname.endsWith('/replies')?(sends++,Response.json({status:'sent',providerId})):url.pathname.endsWith('/cases/'+item.id)?Response.json(detail()):undefined);
});

test('an explicit confirmed send brings its new bubble into view even when reading older history',async()=>{
 let sent=false,finish!:(r:Response)=>void;const viewport={scrollTop:0,scrollHeight:1000,clientHeight:200,getBoundingClientRect:()=>({top:0}),querySelectorAll:()=>[]};
 await withFacebookUI(await component(),async({view}:any)=>{
  viewport.scrollTop=0;await act(async()=>view.root.findByProps({role:'log'}).props.onScroll());assert.equal(viewport.scrollTop,0);
  await act(async()=>facebookButton(view,'发送私信').props.onClick());assert.equal(viewport.scrollTop,1200);assert.equal(replies(view).length,1);await act(async()=>finish(Response.json(detail(true))));
 },(url,init)=>url.pathname.endsWith('/replies')?(sent=true,viewport.scrollHeight=1200,Response.json({status:'sent',providerId:'confirmed-rec2'})):url.pathname.endsWith('/cases/'+item.id)?sent?new Promise(resolve=>{finish=resolve;}):Response.json(detail()):inboxResponse(url,init),element=>element.props.className==='inbox-chat-timeline'?viewport:null);
});
