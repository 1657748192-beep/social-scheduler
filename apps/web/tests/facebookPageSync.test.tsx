import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {act} from 'react-test-renderer';
import {LanguageProvider} from '../components/LanguageProvider';
import {withFacebookUI,facebookButton,facebookText} from './helpers/facebookManagementUI';
const load=async()=>import('../components/social/FacebookPageSyncDialog').catch(()=>null);
const viewData={syncId:'a'.repeat(43),workspaceId:'w1',expiresAt:new Date(Date.now()+900000).toISOString(),status:'ready',pages:[{pageId:'100',name:'Existing',existing:true,eligible:true},{pageId:'101',name:'New one',existing:false,eligible:true},{pageId:'102',name:'New two',existing:false,eligible:true}]};
test('Page sync never auto-selects or imports existing/unselected pages and requires explicit confirmation',async()=>{
 const mod=await load();assert.ok(mod);let refreshed=0;
 await withFacebookUI(<mod.FacebookPageSyncDialog token="token" workspaceId="w1" canManage initialSyncId={viewData.syncId} onClose={()=>{}} onImported={async()=>{refreshed++;}}/>,async({view,requests}:any)=>{
  const checkboxes=view.root.findAllByType('input').filter((n:any)=>n.props.type==='checkbox');assert.equal(checkboxes.length,3);assert.equal(checkboxes[0].props.disabled,true);assert.ok(checkboxes.every((n:any)=>!n.props.checked));
  assert.equal(facebookButton(view,'导入所选主页').props.disabled,true);assert.equal(requests.filter((r:any)=>r.method==='POST').length,0);
  await act(async()=>checkboxes[1].props.onChange());await act(async()=>facebookButton(view,'导入所选主页').props.onClick());assert.equal(requests.filter((r:any)=>r.method==='POST').length,0);
  await act(async()=>facebookButton(view,'确认导入 1 个主页').props.onClick());
  const writes=requests.filter((r:any)=>r.method==='POST');assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{pageIds:['101']});assert.match(facebookText(view),/新增 1 个.*跳过 0 个/);assert.equal(refreshed,1);
 },(url,init)=>url.pathname.endsWith('/confirm')?Response.json({createdPageIds:['101'],skippedPageIds:[]}):Response.json(viewData));
});
test('sync explains official authorization, handles cancellation conflicts, rejects foreign workspace and hides mutation for viewers',async()=>{
 const mod=await load();assert.ok(mod);let closed=0;
 await withFacebookUI(<mod.FacebookPageSyncDialog token="token" workspaceId="w1" canManage onClose={()=>{}} onImported={async()=>{}}/>,async({view,requests}:any)=>{assert.match(facebookText(view),/仅导入新增主页/);assert.ok(facebookButton(view,'前往 Facebook 授权'));assert.equal(requests.length,0);});
 await withFacebookUI(<mod.FacebookPageSyncDialog token="token" workspaceId="w1" canManage initialSyncId={viewData.syncId} onClose={()=>{closed++;}} onImported={async()=>{}}/>,async({view}:any)=>{await act(async()=>facebookButton(view,'取消同步').props.onClick());assert.equal(closed,0);assert.match(facebookText(view),/取消未完成/);},(url,init)=>init?.method==='DELETE'?Response.json({message:'busy'},{status:409}):Response.json(viewData));
 await withFacebookUI(<mod.FacebookPageSyncDialog token="token" workspaceId="w2" canManage initialSyncId={viewData.syncId} onClose={()=>{}} onImported={async()=>{}}/>,async({view}:any)=>{assert.doesNotMatch(facebookText(view),/New one/);assert.match(facebookText(view),/原工作区/);},()=>Response.json(viewData));
 await withFacebookUI(<mod.FacebookPageSyncDialog token="token" workspaceId="w1" canManage={false} onClose={()=>{}} onImported={async()=>{}}/>,async({view,requests}:any)=>{assert.equal(view.toJSON(),null);assert.equal(requests.length,0);});
});

test('an accepted selection can be resumed after reload without automatically resubmitting or choosing other pages',async()=>{
 const mod=await load();assert.ok(mod);
 await withFacebookUI(<mod.FacebookPageSyncDialog token="token" workspaceId="w1" canManage initialSyncId={viewData.syncId} onClose={()=>{}} onImported={async()=>{}}/>,async({view,requests}:any)=>{
  const boxes=view.root.findAllByType('input');assert.equal(boxes[1].props.checked,true);assert.equal(boxes[2].props.checked,false);assert.ok(boxes.every((b:any)=>b.props.disabled));assert.equal(requests.filter((r:any)=>r.method==='POST').length,0);assert.equal(facebookButton(view,'导入所选主页').props.disabled,false);
 },()=>Response.json({...viewData,status:'importing',selectedPageIds:['101']}));
});

test('a late candidate response cannot enter the next workspace or account session',async()=>{
 const mod=await load();assert.ok(mod);let finish!:(value:Response)=>void;
 await withFacebookUI(<mod.FacebookPageSyncDialog token="old-token" workspaceId="w1" canManage initialSyncId={viewData.syncId} onClose={()=>{}} onImported={async()=>{}}/>,async({view}:any)=>{
  await act(async()=>view.update(<LanguageProvider><mod.FacebookPageSyncDialog token="new-token" workspaceId="w2" canManage initialSyncId={viewData.syncId} onClose={()=>{}} onImported={async()=>{}}/></LanguageProvider>));
  await act(async()=>finish(Response.json({...viewData,pages:[{pageId:'101',name:'Old private Page',existing:false,eligible:true}]})));
  assert.doesNotMatch(facebookText(view),/Old private Page/);assert.match(facebookText(view),/New workspace Page/);
 },url=>url.pathname.includes('/workspaces/w1/')?new Promise(resolve=>{finish=resolve;}):Response.json({...viewData,workspaceId:'w2',pages:[{pageId:'101',name:'New workspace Page',existing:false,eligible:true}]}));
});
