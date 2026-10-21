import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {act,create} from 'react-test-renderer';
import {LanguageProvider,useLanguage,LanguageToggle} from '../components/LanguageProvider';

function Text(){const {t}=useLanguage();return <p>{t('控制台','Dashboard')}</p>;}

test('legacy English persistence is not overwritten by the initial Chinese render; switches persist before navigation',async()=>{
 const oldWindow=(globalThis as any).window,oldDocument=(globalThis as any).document;
 const saved=new Map([['social_scheduler_locale','en']]),writes:string[]=[];
 const attrs=new Map([['data-locale-pending','']]);
 const doc={cookie:'',documentElement:{lang:'zh-CN',removeAttribute:(key:string)=>attrs.delete(key)}};
 (globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 (globalThis as any).window={localStorage:{getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>{writes.push(value);saved.set(key,value);}}};
 (globalThis as any).document=doc;
 let view:ReturnType<typeof create>|undefined;
 try{
  await act(async()=>{view=create(<LanguageProvider><LanguageToggle/><Text/></LanguageProvider>);});
  assert.equal(view!.root.findByType('p').children.join(''),'Dashboard');
  assert.ok(!writes.includes('zh-CN'),'initial mount must not write the fallback over saved English');
  assert.match(doc.cookie,/social_scheduler_locale=en/);
  assert.equal(doc.documentElement.lang,'en');assert.equal(attrs.has('data-locale-pending'),false);
  await act(async()=>view!.root.findAllByType('button')[0].props.onClick());
  assert.equal(saved.get('social_scheduler_locale'),'zh-CN');assert.match(doc.cookie,/social_scheduler_locale=zh-CN/);
  assert.equal(view!.root.findByType('p').children.join(''),'控制台');
 }finally{if(view)await act(async()=>view!.unmount());(globalThis as any).window=oldWindow;(globalThis as any).document=oldDocument;}
});

test('a valid server cookie wins over stale browser storage on the first render',async()=>{
 const oldWindow=(globalThis as any).window,oldDocument=(globalThis as any).document;
 const renders:string[]=[];
 function Record(){const {locale}=useLanguage();renders.push(locale);return <Text/>;}
 (globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const store=new Map([['social_scheduler_locale','zh-CN']]);
 (globalThis as any).window={location:{protocol:'https:'},localStorage:{getItem:(k:string)=>store.get(k),setItem:(k:string,v:string)=>store.set(k,v)}};
 const doc={cookie:'social_scheduler_locale=en',documentElement:{lang:'en',removeAttribute(){}}};(globalThis as any).document=doc;
 let view:ReturnType<typeof create>|undefined;
 try{
  await act(async()=>{view=create(<LanguageProvider initialLocale="en"><Record/></LanguageProvider>);});
  assert.ok(renders.length>0);assert.ok(renders.every(l=>l==='en'));assert.equal(store.get('social_scheduler_locale'),'en');assert.match(doc.cookie,/; Secure/);
 }finally{if(view)await act(async()=>view!.unmount());(globalThis as any).window=oldWindow;(globalThis as any).document=oldDocument;}
});

test('blocked cookie and local storage do not break rendering or manual language switching',async()=>{
 const oldWindow=(globalThis as any).window,oldDocument=(globalThis as any).document;
 (globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 (globalThis as any).window={localStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}};
 const doc={documentElement:{lang:'zh-CN',removeAttribute(){}}};Object.defineProperty(doc,'cookie',{get(){throw Error('blocked');},set(){throw Error('blocked');}});(globalThis as any).document=doc;
 let view:ReturnType<typeof create>|undefined;
 try{
  await act(async()=>{view=create(<LanguageProvider><LanguageToggle/><Text/></LanguageProvider>);});
  await act(async()=>view!.root.findAllByType('button')[1].props.onClick());
  assert.equal(view!.root.findByType('p').children.join(''),'Dashboard');assert.equal(doc.documentElement.lang,'en');
 }finally{if(view)await act(async()=>view!.unmount());(globalThis as any).window=oldWindow;(globalThis as any).document=oldDocument;}
});
