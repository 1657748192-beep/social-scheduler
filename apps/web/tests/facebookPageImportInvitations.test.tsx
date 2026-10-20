import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';import {act} from 'react-test-renderer';
import {withFacebookUI,facebookButton,facebookText} from './helpers/facebookManagementUI';
import {LanguageProvider} from '../components/LanguageProvider';
test('invitation creator generates a link without authorizing or importing and clears it when workspace changes',async()=>{
 const mod=await import('../components/social/FacebookPageImportInvitations').catch(()=>null);assert.ok(mod,'invitation task list must exist');
 const props={token:'token',workspaceId:'w1',workspaceName:'Workspace A',canManage:true,onImported:async()=>{}};
 await withFacebookUI(<mod.FacebookPageImportInvitations {...props}/>,async({view,requests,storage}:any)=>{
  await act(async()=>facebookButton(view,'生成邀请链接').props.onClick());assert.equal(requests.filter((r:any)=>r.method==='POST').length,0);
  await act(async()=>facebookButton(view,'确认生成链接').props.onClick());assert.equal(requests.filter((r:any)=>r.method==='POST').length,1);assert.match(facebookText(view),/facebook-page-import#synthetic-share/);assert.ok(!JSON.stringify(storage).includes('synthetic-share'));
  await act(async()=>facebookButton(view,'复制链接').props.onClick());assert.match(facebookText(view),/复制失败/);
  await act(async()=>view.update(<LanguageProvider><mod.FacebookPageImportInvitations {...props} token="new-token" workspaceId="w2" workspaceName="Workspace B"/></LanguageProvider>));assert.doesNotMatch(facebookText(view),/synthetic-share/);assert.equal(requests.filter((r:any)=>r.path.endsWith('/confirm')).length,0);
 },(url,init)=>init?.method==='POST'?Response.json({view:{id:'id',workspaceId:'w1',expiresAt:new Date(Date.now()+86400000).toISOString()},shareUrl:'https://app.example.test/facebook-page-import#synthetic-share'}):Response.json({items:[],nextCursor:null}));
});
test('non-managers cannot render private invitation controls or make requests',async()=>{
 const mod=await import('../components/social/FacebookPageImportInvitations').catch(()=>null);assert.ok(mod);
 await withFacebookUI(<mod.FacebookPageImportInvitations token="token" workspaceId="w1" workspaceName="Workspace" canManage={false} onImported={async()=>{}}/>,async({view,requests}:any)=>{assert.equal(view.toJSON(),null);assert.equal(requests.length,0);});
});
