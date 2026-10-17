import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import FacebookManagementPage from '../app/facebook-management/page';
import FacebookInboxPage from '../app/facebook-inbox/page';
import {PlatformAdminOnly} from '../components/facebook/PlatformAdminOnly';
import {withFacebookUI,facebookText} from './helpers/facebookManagementUI';
function TestSession({children}:{children:React.ReactNode}){window.localStorage.getItem=()=> 'test-token';return <>{children}</>;}

for(const [label,Page] of [['management',FacebookManagementPage],['inbox',FacebookInboxPage]] as const)test(`direct ${label} page denies ordinary workspace owners before mounting management or reading workspaces`,async()=>{
  const old=(globalThis as any).localStorage;(globalThis as any).localStorage={getItem:()=> 'test-token'};(globalThis as any).self={setTimeout:()=>1,clearTimeout(){}};
  const router={replace(){},push(){},back(){},forward(){},refresh(){},prefetch:async()=>{}};
  try{await withFacebookUI(<TestSession><AppRouterContext.Provider value={router}><PathnameContext.Provider value="/facebook-management"><Page/></PathnameContext.Provider></AppRouterContext.Provider></TestSession>,async({view,requests}:any)=>{
    assert.match(facebookText(view),/仅限平台管理员/);
    assert.equal(view.root.findAllByProps({className:'facebook-management-panel'}).length,0);
    assert.equal(requests.filter((r:any)=>r.path.includes('/facebook-management/')&&r.method==='POST').length,0);
    assert.equal(requests.length,1);assert.ok(requests[0].path.endsWith('/auth/me'));
  },url=>url.pathname.endsWith('/auth/me')?Response.json({name:'Customer',isPlatformAdmin:false}):url.pathname.endsWith('/workspaces')?Response.json([{id:'w1',role:'owner'}]):url.pathname.endsWith('/status')?Response.json({enabled:false,configured:false}):undefined);}finally{(globalThis as any).localStorage=old;}
});

test('admin page gate fails closed on missing capability or failed identity, and permits explicit server capability',async()=>{
  for(const response of [Response.json({name:'Owner'}),Response.json({message:'Unavailable'},{status:503}),Response.json({isPlatformAdmin:true})]){
    const data=await response.clone().json();
    await withFacebookUI(<TestSession><PlatformAdminOnly><p>protected-panel-content</p></PlatformAdminOnly></TestSession>,async({view}:any)=>{
      if(data.isPlatformAdmin===true)assert.match(facebookText(view),/protected-panel-content/);
      else{assert.doesNotMatch(facebookText(view),/protected-panel-content/);assert.match(facebookText(view),/仅限平台管理员/);}
    },()=>response);
  }
});
