import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {act} from 'react-test-renderer';
import {FacebookInbox} from '../components/inbox/FacebookInbox';
import {withFacebookUI,facebookWorkspaces,facebookText,defaultFacebookResponse} from './helpers/facebookManagementUI';
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
  let release!:(r:Response)=>void;
  await withFacebookUI(React.createElement(FacebookInbox,{token:'test',workspaces:facebookWorkspaces}),async({view}:any)=>{
    assert.match(facebookText(view),/Customer p1/);
    await act(async()=>view.root.findByProps({'aria-label':'公共主页'}).props.onChange({target:{value:'p2'}}));
    await act(async()=>release(defaultFacebookResponse(new URL('http://localhost/api/v1/workspaces/w1/facebook-management/pages/p2/conversations'))));
    assert.match(facebookText(view),/Customer p2/);assert.doesNotMatch(facebookText(view),/private-p1/);
  },url=>url.pathname.includes('/p2/')&&url.pathname.endsWith('/conversations')?new Promise<Response>(r=>{release=r;}):undefined);
});
