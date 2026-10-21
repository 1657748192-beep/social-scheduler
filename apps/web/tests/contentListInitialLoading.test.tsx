import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {LanguageProvider} from '../components/LanguageProvider';
import {DraftManager} from '../components/drafts/DraftManager';
import {PublishedPostManager} from '../components/posts/PublishedPostManager';

for(const [name,Manager,loading,empty] of [
 ['drafts',DraftManager,'Loading drafts','No drafts yet'],
 ['published posts',PublishedPostManager,'Loading published posts','No published posts yet'],
] as const){
 test(`${name}: initial render cannot claim empty before the content request`,()=>{
  (globalThis as any).React=React;
  const html=renderToStaticMarkup(<LanguageProvider initialLocale="en"><Manager token="synthetic" workspaces={[{id:'w1',name:'Workspace',role:'owner'}] as any}/></LanguageProvider>);
  assert.ok(html.includes(loading));assert.ok(!html.includes(empty));
 });
}
