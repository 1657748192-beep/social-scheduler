import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {act} from 'react-test-renderer';
import {withInboxUI,inboxCase} from './helpers/interactionInboxUI';import {facebookButton,facebookText} from './helpers/facebookManagementUI';
import {ReplyComposer} from '../components/inbox/unified/ReplyComposer';import {LanguageToggle} from '../components/LanguageProvider';
const fixed='Social Scheduler Instagram comment reply test REC1. This reply is for app review demonstration only.';
function detail(state='available',expiresAt=new Date(Date.now()+60000).toISOString()):any{return{...inboxCase,items:[],nextCursor:null,officialUrl:null,replyTarget:'rec1',capabilities:[{capability:'comments.reply',available:true}],recordingReply:{text:fixed,expiresAt,state}};}
test('recording text is locked and a single explicit click is required; successful sends remain locked',async()=>{
 let sends=0;await withInboxUI(<><LanguageToggle/><ReplyComposer detail={detail()} accountName="mooyamcosmetic" canWrite onDirtyChange={()=>{}} onAcknowledge={async()=>{throw Error('no reset');}} onSend={async v=>{sends++;assert.equal(v.text,fixed);return{status:'sent',providerId:'one'};}}/></>,async({view}:any)=>{
  assert.equal(sends,0);const textarea=view.root.findByProps({'aria-label':'回复正文'});assert.equal(textarea.props.value,fixed);assert.equal(textarea.props.readOnly,true);
  await act(async()=>facebookButton(view,'English').props.onClick());assert.match(facebookText(view),/one attempt/i);
  await act(async()=>facebookButton(view,'Send public reply').props.onClick());assert.equal(sends,1);assert.equal(facebookButton(view,'Send public reply').props.disabled,true);
 });
});
for(const state of ['used','expired'])test(`recording ${state} cannot send or unlock a new attempt`,async()=>withInboxUI(<ReplyComposer detail={detail(state)} accountName="mooyamcosmetic" canWrite onDirtyChange={()=>{}} onAcknowledge={async()=>{throw Error('no reset');}} onSend={async()=>{throw Error('no send');}}/>,async({view}:any)=>{assert.equal(facebookButton(view,'发送公开回复').props.disabled,true);assert.equal(view.root.findAllByType('input').length,0);}));
test('recording unknown outcome provides verification guidance, not an acknowledgement bypass',async()=>withInboxUI(<ReplyComposer detail={detail()} accountName="mooyamcosmetic" canWrite onDirtyChange={()=>{}} onAcknowledge={async()=>{throw Error('no reset');}} onSend={async()=>({status:'unknown',diagnosticId:'test'})}/>,async({view}:any)=>{
 await act(async()=>facebookButton(view,'发送公开回复').props.onClick());assert.equal(facebookButton(view,'发送公开回复').props.disabled,true);assert.equal(view.root.findAllByType('input').length,0);assert.match(facebookText(view),/不会重发/);
}));
test('recording expiry disables the button even after a timer longer than the platform maximum',async t=>{
 const now=Date.now(),maximum=2147483647;t.mock.timers.enable({apis:['setTimeout','Date'],now});
 await withInboxUI(<ReplyComposer detail={detail('available',new Date(now+maximum+1000).toISOString())} accountName="mooyamcosmetic" canWrite onDirtyChange={()=>{}} onAcknowledge={async()=>{}} onSend={async()=>{throw Error('no send');}}/>,async({view}:any)=>{
  assert.equal(facebookButton(view,'发送公开回复').props.disabled,false);
  await act(async()=>t.mock.timers.tick(maximum));assert.equal(facebookButton(view,'发送公开回复').props.disabled,false);
  await act(async()=>t.mock.timers.tick(1000));assert.equal(facebookButton(view,'发送公开回复').props.disabled,true);
 });
});

for(const state of ['used','expired'])test(`recording ${state} explains its restriction without incorrectly asking for authorization`,async()=>withInboxUI(<><LanguageToggle/><ReplyComposer detail={{...detail(state),capabilities:[{capability:'comments.reply',available:false,reason:'recording_restricted'}]}} accountName="mooyamcosmetic" canWrite onDirtyChange={()=>{}} onAcknowledge={async()=>{throw Error('no reset');}} onSend={async()=>{throw Error('no send');}}/></>,async({view}:any)=>{
 assert.doesNotMatch(facebookText(view),/请检查独立授权与平台限制/);await act(async()=>facebookButton(view,'English').props.onClick());assert.doesNotMatch(facebookText(view),/Check authorization and platform restrictions/);assert.equal(facebookButton(view,'Send public reply').props.disabled,true);
}));

test('successful recording send does not display an authorization failure next to its success receipt',async()=>withInboxUI(<ReplyComposer detail={detail()} accountName="mooyamcosmetic" canWrite onDirtyChange={()=>{}} onAcknowledge={async()=>{throw Error('no reset');}} onSend={async()=>({status:'sent',providerId:'one'})}/>,async({view}:any)=>{
 await act(async()=>facebookButton(view,'发送公开回复').props.onClick());assert.match(facebookText(view),/平台已确认发送成功/);assert.doesNotMatch(facebookText(view),/请检查独立授权与平台限制/);assert.equal(facebookButton(view,'发送公开回复').props.disabled,true);
}));

test('an available recording with genuinely missing authorization still explains the access restriction',async()=>withInboxUI(<ReplyComposer detail={{...detail(),capabilities:[{capability:'comments.reply',available:false,reason:'authorization_required'}]}} accountName="mooyamcosmetic" canWrite onDirtyChange={()=>{}} onAcknowledge={async()=>{}} onSend={async()=>{throw Error('no send');}}/>,async({view}:any)=>{
 assert.match(facebookText(view),/请检查独立授权与平台限制/);assert.equal(facebookButton(view,'发送公开回复').props.disabled,true);
}));
