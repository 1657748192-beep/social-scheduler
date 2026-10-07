import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../components/LanguageProvider';
import { InboxPlatformTabs } from '../components/inbox/InboxPlatformTabs';
import { createFacebookRequestGuard } from '../lib/facebookEngagement';
test('platformTabsPreserveInstagram',()=>{
  (globalThis as any).React=React;
  const html=renderToStaticMarkup(React.createElement(LanguageProvider,null,React.createElement(InboxPlatformTabs,{enabled:false,value:'instagram',onChange:()=>{}})));
  assert.match(html,/Instagram/);assert.doesNotMatch(html,/Facebook/);
  const enabled=renderToStaticMarkup(React.createElement(LanguageProvider,null,React.createElement(InboxPlatformTabs,{enabled:true,value:'instagram',onChange:()=>{}})));
  assert.match(enabled,/Facebook/);assert.match(enabled,/aria-pressed="true">Instagram/);
});
test('staleResponsesAndDuplicateSubmit',async()=>{
  const guard=createFacebookRequestGuard();guard.reset('workspace:account1');let release!:(value:string)=>void;
  const old=guard.run('messages',()=>new Promise<string>(resolve=>{release=resolve;}));guard.reset('workspace:account2');release('old');
  assert.deepEqual(await old,{current:false});
  let finish!:(value:{status:'unknown'})=>void,calls=0;
  const send=()=>{calls++;return new Promise<{status:'unknown'}>(resolve=>{finish=resolve;});};
  const first=guard.send(send);assert.deepEqual(await guard.send(send),{current:false});finish({status:'unknown'});
  assert.deepEqual(await first,{current:true,value:{status:'unknown'}});assert.equal(calls,1);
});
