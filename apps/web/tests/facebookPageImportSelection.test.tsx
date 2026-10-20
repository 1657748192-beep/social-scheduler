import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';import {act} from 'react-test-renderer';
import {withFacebookUI,facebookButton,facebookText} from './helpers/facebookManagementUI';
const view:any={id:'invite',workspaceId:'w1',status:'authorized_pending_selection',note:'Partner A',candidateExpiresAt:new Date(Date.now()+86400000).toISOString(),result:null,pages:[{pageId:'100',name:'Same name',existing:true,eligible:true},{pageId:'101',name:'Same name',avatarUrl:'https://scontent.fbcdn.net/avatar',existing:false,eligible:true},{pageId:'102',name:'Other',existing:false,eligible:false}]};
test('empty selection explains whether authorization returned no Pages or all Pages already exist',async()=>{
 const {FacebookPageImportSelection}=await import('../components/social/FacebookPageImportSelection');
 for(const [pages,message] of [[[],/授权已完成，暂无可新增的公共主页/],[[view.pages[0]],/这些公共主页已添加，无需重复导入/]] as const){
  await withFacebookUI(<FacebookPageImportSelection view={{...view,pages}} busy={false} onConfirm={async()=>{throw Error('unexpected import');}} onCompleteEmpty={async()=>{}} onClose={()=>{}}/>,async({view:ui}:any)=>{assert.match(facebookText(ui),message);assert.ok(facebookButton(ui,'完成，无需导入'));});
 }
});
test('creator explicitly selects new Pages, with a separate confirmation and existing Pages disabled',async()=>{
 const mod=await import('../components/social/FacebookPageImportSelection').catch(()=>null);assert.ok(mod,'selection component must exist');const sent:string[][]=[];
 await withFacebookUI(<mod.FacebookPageImportSelection view={view} busy={false} onConfirm={async(ids)=>{sent.push(ids);}} onCompleteEmpty={async()=>{}} onClose={()=>{}}/>,async({view:ui}:any)=>{
  const boxes=ui.root.findAllByType('input').filter((n:any)=>n.props.type==='checkbox');assert.equal(boxes.length,3);assert.equal(boxes[0].props.disabled,true);assert.equal(boxes[2].props.disabled,true);assert.ok(boxes.every((n:any)=>!n.props.checked));assert.equal(ui.root.findAllByType('img')[0]?.props.src,'https://scontent.fbcdn.net/avatar');
  await act(async()=>boxes[1].props.onChange());await act(async()=>facebookButton(ui,'导入所选主页').props.onClick());assert.equal(sent.length,0);
  await act(async()=>facebookButton(ui,'确认导入 1 个主页').props.onClick());assert.deepEqual(sent,[['101']]);
 });
});
test('filtered select-all caps selection at fifty and empty completion never submits arbitrary empty confirmation',async()=>{
 const mod=await import('../components/social/FacebookPageImportSelection').catch(()=>null);assert.ok(mod);
 const many={...view,pages:Array.from({length:55},(_,i)=>({pageId:String(i+100),name:'Page '+i,existing:false,eligible:true}))};
 await withFacebookUI(<mod.FacebookPageImportSelection view={many} busy={false} onConfirm={async()=>{}} onCompleteEmpty={async()=>{}} onClose={()=>{}}/>,async({view:ui}:any)=>{
  await act(async()=>facebookButton(ui,'全选当前筛选的新增主页').props.onClick());const boxes=ui.root.findAllByType('input').filter((n:any)=>n.props.type==='checkbox');assert.equal(boxes.filter((n:any)=>n.props.checked).length,50);assert.match(facebookText(ui),/50/);
 });
 let empty=0;await withFacebookUI(<mod.FacebookPageImportSelection view={{...view,pages:[view.pages[0]]}} busy={false} onConfirm={async()=>{throw Error('not permitted');}} onCompleteEmpty={async()=>{empty++;}} onClose={()=>{}}/>,async({view:ui}:any)=>{await act(async()=>facebookButton(ui,'完成，无需导入').props.onClick());assert.equal(empty,1);});
});
