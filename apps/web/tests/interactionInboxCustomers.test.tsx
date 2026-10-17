import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {act} from 'react-test-renderer';import {withInboxUI,inboxCase} from './helpers/interactionInboxUI';import {facebookButton,facebookText} from './helpers/facebookManagementUI';
test('customer notes use a local action and never the reply endpoint',async()=>{
 const m=await import('../components/inbox/unified/ContactPanel').catch(()=>null);assert.ok(m,'customer panel required');const actions:any[]=[];
 await withInboxUI(<m.ContactPanel customer={{id:inboxCase.customerId!,version:1,name:'Customer One',identities:[],tags:[],notes:[],cases:[]}} tags={[]} canWrite canManage onMutate={async(action,input)=>{actions.push({action,input});}}/>,async({view}:any)=>{
  await act(async()=>view.root.findByProps({'aria-label':'内部备注'}).props.onChange({target:{value:'internal price'}}));await act(async()=>facebookButton(view,'保存内部备注').props.onClick());assert.deepEqual(actions,[{action:'note.create',input:{text:'internal price'}}]);assert.match(facebookText(view),/不发送给客户/);
 });
});
