import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {FacebookInbox} from '../components/inbox/FacebookInbox';
import {LanguageProvider} from '../components/LanguageProvider';
import {apiRequest} from '../lib/api';
test('provider reauthorization conflict preserves the application session at the request boundary',async()=>{
  const previousFetch=globalThis.fetch,previousWindow=(globalThis as any).window;let removals=0,redirects=0;
  (globalThis as any).window={localStorage:{removeItem:()=>removals++},location:{pathname:'/inbox',assign:()=>redirects++}};
  try{globalThis.fetch=async()=>Response.json({message:'Facebook authorization_invalid'},{status:409});
    await assert.rejects(apiRequest('/facebook',{token:'valid-application-session'}));assert.equal(removals,0);assert.equal(redirects,0);
    globalThis.fetch=async()=>Response.json({message:'Session expired'},{status:401});
    await assert.rejects(apiRequest('/facebook',{token:'expired-application-session'}));assert.equal(removals,2);assert.equal(redirects,1);
  }finally{globalThis.fetch=previousFetch;(globalThis as any).window=previousWindow;}
});
test('Page switch reads its new conversations even while clearing the old selection',async()=>{
  const previousFetch=globalThis.fetch,previousWindow=(globalThis as any).window,previousDocument=(globalThis as any).document;
  (globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  (globalThis as any).window={localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},setInterval:()=>1,clearInterval:()=>{},location:{assign:()=>{}}};
  (globalThis as any).document={documentElement:{lang:''},visibilityState:'visible'};
  let release!:()=>void;let view:ReactTestRenderer;
  globalThis.fetch=async input=>{
    const path=new URL(String(input)).pathname;
    if(path.endsWith('/social-accounts'))return Response.json(['a','b'].map(id=>({id,platform:'facebook',accountType:'page',status:'active',displayName:id})));
    if(path.endsWith('/conversations')){
      const id=path.includes('/a/')?'a':'b';if(id==='b')await new Promise<void>(resolve=>{release=resolve;});
      return Response.json({items:[{id:'thread-'+id,counterpartyId:'customer-'+id,updatedAt:new Date().toISOString()}],nextCursor:null});
    }
    if(path.endsWith('/messages'))return Response.json({items:[],nextCursor:null});
    return Response.json(Object.fromEntries(['readComments','replyComments','readMessages','replyMessages','subscription'].map(key=>[key,{status:'available'}])));
  };
  try{
    await act(async()=>{view=create(React.createElement(LanguageProvider,null,React.createElement(FacebookInbox,{token:'test',workspaces:[{id:'workspace',name:'Test',role:'owner'} as any]})));});
    assert.match(JSON.stringify(view!.toJSON()),/customer-a/);
    await act(async()=>{view!.root.findAllByType('select')[1].props.onChange({target:{value:'b'}});});
    await act(async()=>{release();});
    assert.match(JSON.stringify(view!.toJSON()),/customer-b/);
  }finally{if(view!)await act(async()=>view.unmount());globalThis.fetch=previousFetch;(globalThis as any).window=previousWindow;(globalThis as any).document=previousDocument;}
});
