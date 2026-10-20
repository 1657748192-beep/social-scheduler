import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';import {act} from 'react-test-renderer';
import {withFacebookUI,facebookButton,facebookText} from './helpers/facebookManagementUI';
import {LanguageProvider} from '../components/LanguageProvider';
const task=(id:string,status:string)=>({id,workspaceId:'w1',note:id,status,createdAt:'2026-10-20T05:00:00.000Z',expiresAt:'2026-10-21T05:00:00.000Z',candidateExpiresAt:null,retentionExpiresAt:null,result:null});
test('pending tasks stay visible while completed and revoked tasks require expanding history',async()=>{
 const {FacebookPageImportInvitations}=await import('../components/social/FacebookPageImportInvitations');
 await withFacebookUI(<FacebookPageImportInvitations token="token" workspaceId="w1" workspaceName="Workspace" canManage onImported={async()=>{}}/>,async({view,requests}:any)=>{
  for(const name of ['Awaiting partner','Importing partner','Unknown partner'])assert.ok(facebookText(view).includes(name));
  assert.doesNotMatch(facebookText(view),/Finished partner|Revoked partner|Expired partner|Cancelled partner/);
  const toggle=facebookButton(view,'历史记录（4）');assert.ok(toggle);assert.equal(toggle.props['aria-expanded'],false);
  await act(async()=>toggle.props.onClick());for(const name of ['Finished partner','Revoked partner','Expired partner','Cancelled partner'])assert.ok(facebookText(view).includes(name));assert.match(facebookText(view),/新增 3 个主页，跳过 2 个已有主页/);
  assert.equal(facebookButton(view,'历史记录（4）').props['aria-expanded'],true);
  await act(async()=>facebookButton(view,'历史记录（4）').props.onClick());assert.doesNotMatch(facebookText(view),/Finished partner|Revoked partner|Expired partner|Cancelled partner/);
  assert.equal(requests.filter((r:any)=>r.method==='POST').length,0);
 },()=>Response.json({items:[task('Awaiting partner','awaiting_authorization'),task('Importing partner','importing'),task('Unknown partner','future_status'),{...task('Finished partner','completed'),result:{createdPageIds:['101','102','103'],skippedPageIds:['100','104']}},task('Revoked partner','revoked'),task('Expired partner','expired'),task('Cancelled partner','cancelled')],nextCursor:null}));
});
test('history-only tasks use compact idle view and collapse again on workspace change',async()=>{
 const {FacebookPageImportInvitations}=await import('../components/social/FacebookPageImportInvitations');
 const props={token:'token',workspaceId:'w1',workspaceName:'Workspace',canManage:true,onImported:async()=>{}};
 await withFacebookUI(<FacebookPageImportInvitations {...props}/>,async({view}:any)=>{
  assert.match(facebookText(view),/暂无待处理任务/);assert.doesNotMatch(facebookText(view),/Finished partner/);assert.equal(view.root.findAllByProps({className:'account-manager-grid'}).length,0);
  assert.ok(facebookButton(view,'生成邀请链接'));await act(async()=>facebookButton(view,'历史记录（1）').props.onClick());assert.match(facebookText(view),/Finished partner/);
  await act(async()=>view.update(<LanguageProvider><FacebookPageImportInvitations {...props} workspaceId="w2"/></LanguageProvider>));assert.doesNotMatch(facebookText(view),/Finished partner/);assert.equal(facebookButton(view,'历史记录（1）').props['aria-expanded'],false);
 },url=>Response.json({items:[{...task('Finished partner','completed'),workspaceId:url.pathname.includes('/w2/')?'w2':'w1'}],nextCursor:null}));
});
test('pagination remains reachable with history collapsed and reveals older pending tasks',async()=>{
 const {FacebookPageImportInvitations}=await import('../components/social/FacebookPageImportInvitations');
 await withFacebookUI(<FacebookPageImportInvitations token="token" workspaceId="w1" workspaceName="Workspace" canManage onImported={async()=>{}}/>,async({view}:any)=>{
  assert.doesNotMatch(facebookText(view),/Finished partner/);assert.ok(facebookButton(view,'加载更多任务'));
  await act(async()=>facebookButton(view,'加载更多任务').props.onClick());assert.match(facebookText(view),/Older pending/);assert.doesNotMatch(facebookText(view),/Finished partner/);
 },url=>Response.json(url.searchParams.has('cursor')?{items:[task('Older pending','authorized_pending_selection')],nextCursor:null}:{items:[task('Finished partner','completed')],nextCursor:'older'}));
});
test('task list distinguishes empty authorization, existing Pages and directory failure',async()=>{
 const {FacebookPageImportInvitations}=await import('../components/social/FacebookPageImportInvitations');
 await withFacebookUI(<FacebookPageImportInvitations token="token" workspaceId="w1" workspaceName="Workspace" canManage onImported={async()=>{}}/>,async({view}:any)=>{
  assert.match(facebookText(view),/授权已完成，暂无可新增的公共主页/);assert.match(facebookText(view),/这些公共主页已添加，无需重复导入/);assert.match(facebookText(view),/公共主页读取失败，请重试/);
  assert.doesNotMatch(facebookText(view),/等待对方授权/);
 },()=>Response.json({items:['no_new_pages','all_existing','read_failed'].map((authorizationOutcome,i)=>({id:String(i),workspaceId:'w1',status:i===2?'awaiting_authorization':'authorized_pending_selection',authorizationOutcome,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()})),nextCursor:null}));
});
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
