import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {runInNewContext} from 'node:vm';
import {LanguageProvider,useLanguage} from '../components/LanguageProvider';
import {localeBootstrap,validLocale} from '../lib/locale';

test('the server-selected English locale is used in the first HTML, not Chinese',()=>{
 (globalThis as any).React=React;
 function Text(){const {t}=useLanguage();return <p>{t('控制台','Dashboard')}</p>;}
 const html=renderToStaticMarkup(<LanguageProvider initialLocale="en"><Text/></LanguageProvider>);
 assert.match(html,/Dashboard/);assert.doesNotMatch(html,/控制台/);
});

test('before-paint migration conceals only a mismatched legacy preference, without writing storage',()=>{
 for(const input of [
  {cookie:'',saved:'en',lang:'zh-CN',pending:true},
  {cookie:'social_scheduler_locale=en',saved:'zh-CN',lang:'en',pending:false},
  {cookie:'social_scheduler_locale=bad',saved:'en',lang:'zh-CN',pending:true},
  {cookie:'',saved:'invalid',lang:'zh-CN',pending:false},
  {cookie:'',saved:'en',lang:'en',pending:false},
 ]){
  const attrs=new Map();
  runInNewContext(localeBootstrap,{document:{cookie:input.cookie,documentElement:{lang:input.lang,setAttribute:(k:string,v:string)=>attrs.set(k,v)}},localStorage:{getItem:()=>input.saved}});
  assert.equal(attrs.has('data-locale-pending'),input.pending,JSON.stringify(input));
 }
 assert.equal(validLocale('<script>'),undefined);assert.equal(validLocale('en'),'en');assert.equal(validLocale('zh-CN'),'zh-CN');
});
