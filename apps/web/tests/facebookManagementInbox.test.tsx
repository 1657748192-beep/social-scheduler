import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {act} from 'react-test-renderer';
import {FacebookInbox} from '../components/inbox/FacebookInbox';
import {withFacebookUI,facebookWorkspaces,facebookText,facebookButton,defaultFacebookResponse,envelope,readAt} from './helpers/facebookManagementUI';
const inbox=(role='owner')=><FacebookInbox token="software-token" workspaces={[{...facebookWorkspaces[0],role}]}/>;

test('switchingPageClearsDraftAndIgnoresLateReadSendAndErrors',async()=>{
  let holdRead=false,releaseRead!:(r:Response)=>void,rejectOld!:(e:Error)=>void,finishNew!:(r:Response)=>void;
  await withFacebookUI(inbox(),async({view,requests,storage}:any)=>{
    assert.match(facebookText(view),/private-p1/);
    await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'old draft'}}));
    await act(async()=>facebookButton(view,'发送').props.onClick());
    holdRead=true;await act(async()=>facebookButton(view,'刷新').props.onClick());
    await act(async()=>view.root.findByProps({'aria-label':'公共主页'}).props.onChange({target:{value:'p2'}}));
    assert.match(facebookText(view),/private-p2/);assert.doesNotMatch(facebookText(view),/private-p1|old draft/);
    assert.equal(view.root.findByType('textarea').props.value,'');
    await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'new draft'}}));
    await act(async()=>facebookButton(view,'发送').props.onClick());
    await act(async()=>{rejectOld(Error('old private error'));releaseRead(defaultFacebookResponse(new URL('http://localhost/api/v1/workspaces/w1/facebook-management/pages/p1/conversations/thread-p1/messages')));});
    assert.doesNotMatch(facebookText(view),/old private error|private-p1/);assert.equal(view.root.findByType('textarea').props.value,'new draft');
    await act(async()=>facebookButton(view,'发送').props.onClick());assert.equal(requests.filter((r:any)=>r.method==='POST'&&r.path.endsWith('/replies')).length,2);
    await act(async()=>finishNew(Response.json({status:'sent',providerId:'new-confirmed'})));assert.equal(view.root.findByType('textarea').props.value,'');
    assert.ok(storage.every(([,value]:[string,string])=>!value.includes('draft')));assert.ok(requests.every((r:any)=>!r.path.includes('facebook-engagement')&&!r.path.includes('/social-accounts/')));
  },(url,init)=>{
    if(url.pathname.endsWith('/replies'))return new Promise<Response>((resolve,reject)=>{if(url.pathname.includes('/p1/'))rejectOld=reject;else finishNew=resolve;});
    if(holdRead&&url.pathname.includes('/p1/')&&url.pathname.endsWith('/messages'))return new Promise<Response>(r=>{releaseRead=r;});
  });
});

test('manualRefreshWorksWithoutWebhookAndErrorDoesNotBecomeEmpty',async()=>{
  let fail=false;
  await withFacebookUI(inbox(),async({view,timers,document,requests,unmount}:any)=>{
    assert.match(facebookText(view),/private-p1/);assert.equal(timers.size,1);const timer=[...timers.values()][0] as any;assert.equal(timer.ms,30000);
    const count=requests.length;document.visibilityState='hidden';await act(async()=>timer.callback());assert.equal(requests.length,count);
    document.visibilityState='visible';await act(async()=>timer.callback());assert.ok(requests.length>count);
    fail=true;await act(async()=>facebookButton(view,'刷新').props.onClick());
    assert.match(facebookText(view),/private-p1/);assert.match(facebookText(view),/upstream unavailable/);assert.ok(view.root.findAllByType('time').some((n:any)=>n.props.dateTime===readAt));
    await unmount();assert.equal(timers.size,0);const after=requests.length;await act(async()=>timer.callback());assert.equal(requests.length,after);
  },url=>fail&&(url.pathname.endsWith('/conversations')||url.pathname.endsWith('/messages'))?Response.json({message:'upstream unavailable'},{status:502}):undefined);
});

test('viewerClosedWindowAndUnknownRepliesNeverSendAutomatically',async()=>{
  await withFacebookUI(inbox('viewer'),async({view}:any)=>{assert.match(facebookText(view),/private-p1/);assert.equal(view.root.findAllByType('textarea').length,0);assert.equal(facebookButton(view,'发送'),undefined);});
  await withFacebookUI(inbox(),async({view,requests}:any)=>{assert.equal(facebookButton(view,'发送').props.disabled,true);await act(async()=>facebookButton(view,'发送').props.onClick());assert.equal(requests.filter((r:any)=>r.method==='POST').length,0);},url=>url.pathname.endsWith('/messages')?Response.json(envelope([{id:'old',conversationId:'thread-p1',senderId:'300',recipientId:'100',inbound:true,text:'old',timestamp:new Date(Date.now()-86400000).toISOString()}])):undefined);
  await withFacebookUI(inbox(),async({view,requests,timers}:any)=>{
    await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'Manual reply'}}));
    const send=facebookButton(view,'发送').props.onClick;await act(async()=>{void send();void send();});
    const posts=requests.filter((r:any)=>r.path.endsWith('/replies'));assert.equal(posts.length,1);assert.match(posts[0].body.requestKey,/^[0-9a-f-]{36}$/i);
    assert.match(facebookText(view),/结果未知|待核实/);assert.equal(view.root.findByType('textarea').props.value,'Manual reply');
    await act(async()=>facebookButton(view,'刷新').props.onClick());for(const timer of timers.values())await act(async()=>timer.callback());
    assert.equal(requests.filter((r:any)=>r.path.endsWith('/replies')).length,1);
    const restart=facebookButton(view,'开始新的回复（不自动发送）');assert.equal(restart.props.disabled,true);
    await act(async()=>restart.props.onClick());assert.equal(view.root.findByType('textarea').props.disabled,true);
    await act(async()=>view.root.findByProps({type:'checkbox'}).props.onChange({target:{checked:true}}));await act(async()=>facebookButton(view,'开始新的回复（不自动发送）').props.onClick());
    assert.equal(requests.filter((r:any)=>r.path.endsWith('/replies')).length,1);
  },url=>url.pathname.endsWith('/replies')?Response.json({status:'unknown',diagnosticId:'fixture'}):undefined);
});

test('untrustedPageQueryDoesNotSilentlySelectAnotherConnection',async()=>withFacebookUI(<FacebookInbox token="token" workspaces={facebookWorkspaces} initialContext={{workspaceId:'foreign',managedPageId:'p1',connectionId:'c1'}}/>,async({view,requests}:any)=>{
  assert.doesNotMatch(facebookText(view),/private-p1/);assert.match(facebookText(view),/请求的主页或连接不可用/);assert.ok(requests.every((r:any)=>!r.path.includes('/foreign/')));
  await act(async()=>view.root.findByProps({'aria-label':'公共主页'}).props.onChange({target:{value:'p1'}}));assert.match(facebookText(view),/private-p1/);
}));
test('definitiveReplyFailureKeepsDraftWithoutAutomaticResend',async()=>withFacebookUI(inbox(),async({view,requests}:any)=>{
  await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'Keep this draft'}}));await act(async()=>facebookButton(view,'发送').props.onClick());
  assert.equal(view.root.findByType('textarea').props.value,'Keep this draft');assert.match(facebookText(view),/回复未发送/);assert.equal(requests.filter((r:any)=>r.path.endsWith('/replies')).length,1);
},url=>url.pathname.endsWith('/replies')?Response.json({status:'failed',code:'permission_missing',diagnosticId:'fixture'}):undefined));
