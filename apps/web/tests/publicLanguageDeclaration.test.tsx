import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import Home from '../app/page';
import EnglishHome from '../app/en/page';
import Privacy from '../app/privacy/page';
import EnglishPrivacy from '../app/en/privacy/page';
import Terms from '../app/terms/page';
import EnglishTerms from '../app/en/terms/page';
import Deletion from '../app/data-deletion/page';

test('URL-selected public content declares its own language independently of the saved application preference',()=>{
 (globalThis as any).React=React;
 for(const [Page,lang] of [[Home,'zh-CN'],[EnglishHome,'en'],[Privacy,'zh-CN'],[EnglishPrivacy,'en'],[Terms,'zh-CN'],[EnglishTerms,'en'],[Deletion,'zh-CN']] as const){
  const html=renderToStaticMarkup(<Page/>);
  assert.match(html,new RegExp(`<main[^>]*lang="${lang}"`));
 }
});
