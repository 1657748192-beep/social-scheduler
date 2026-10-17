import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {AppShell} from '../components/AppShell';
import {LanguageProvider} from '../components/LanguageProvider';
test('BM navigationRequiresNewEnabledStatusAndNeverCallsRetiredAuthorization',async()=>{
  const saved={fetch:globalThis.fetch,window:(globalThis as any).window,document:(globalThis as any).document,self:(globalThis as any).self,storage:(globalThis as any).localStorage};
  (globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  const storage={getItem:(key:string)=>key==='social_scheduler_token'?'test-token':null,setItem(){}};
  (globalThis as any).window={localStorage:storage};(globalThis as any).localStorage=storage;
  // Next Link's idle-prefetch scheduling is outside this component's contract.
  (globalThis as any).self={setTimeout:()=>1,clearTimeout(){}};
  (globalThis as any).document={documentElement:{lang:''}};
  const requests:string[]=[];let enabled=true,isPlatformAdmin=true,view:ReactTestRenderer;
  globalThis.fetch=async raw=>{const path=new URL(String(raw)).pathname;requests.push(path);if(path.endsWith('/auth/me'))return Response.json({name:'Andy',isPlatformAdmin});if(path.endsWith('/workspaces'))return Response.json([{id:'workspace',role:'owner'}]);if(path.endsWith('/facebook-management/status'))return Response.json({enabled,configured:enabled});throw Error('Unexpected navigation endpoint');};
  const router={back(){},forward(){},refresh(){},push(){},replace(){},prefetch:async()=>{}};
  const element=()=>React.createElement(AppRouterContext.Provider,{value:router},React.createElement(PathnameContext.Provider,{value:'/dashboard'},React.createElement(LanguageProvider,null,React.createElement(AppShell,{title:'Dashboard',children:null}))));
  try{
    await act(async()=>{view=create(element());});assert.equal(view!.root.findAllByType('a').some(a=>a.props.href==='/facebook-management'),true);assert.equal(view!.root.findAllByType('a').some(a=>a.props.href==='/facebook-inbox'),true);
    await act(async()=>view.unmount());enabled=false;await act(async()=>{view=create(element());});assert.equal(view!.root.findAllByType('a').some(a=>a.props.href==='/facebook-management'),false);assert.equal(view!.root.findAllByType('a').some(a=>a.props.href==='/facebook-inbox'),false);
    assert.ok(requests.every(path=>!path.includes('facebook-engagement')));
    await act(async()=>view.unmount());enabled=true;isPlatformAdmin=false;requests.length=0;await act(async()=>{view=create(element());});
    assert.equal(view!.root.findAllByType('a').some(a=>['/facebook-management','/facebook-inbox'].includes(a.props.href)),false);
    assert.ok(requests.every(path=>path.endsWith('/auth/me')),'customer navigation must not query management or workspace data');
  }finally{if(view!)await act(async()=>view.unmount());globalThis.fetch=saved.fetch;(globalThis as any).window=saved.window;(globalThis as any).document=saved.document;(globalThis as any).self=saved.self;(globalThis as any).localStorage=saved.storage;}
});
