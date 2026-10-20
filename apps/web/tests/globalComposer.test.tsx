import React,{useState} from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {act} from 'react-test-renderer';
import {ComposerForm} from '../components/composer/ComposerForm';
import {withFacebookUI,facebookButton,facebookText,facebookWorkspaces} from './helpers/facebookManagementUI';
const accounts=['a1','a2'].map(id=>({id,displayName:id,platform:'facebook',status:'active',accountType:'page',capabilities:{},avatarUrl:null}));
export function composerResponse(url:URL,init?:RequestInit){
 if(url.pathname.endsWith('/auth/me'))return Response.json({id:'u1'});
 if(url.pathname.endsWith('/social-accounts'))return Response.json(accounts);
 if(url.pathname.endsWith('/composer/posts')&&init?.method==='POST')return Response.json({id:'post',variants:[]});
 return undefined;
}
async function prepare(view:any){
 await act(async()=>view.root.findByProps({className:'composer-textarea compact'}).props.onChange({target:{value:'hello'}}));
 assert.ok(facebookButton(view,'取消全选'));
 await act(async()=>facebookButton(view,'定时发布').props.onClick());
}
async function choose(view:any,query:string){
 const input=view.root.findByProps({'aria-label':'发布地区与时区'});
 await act(async()=>input.props.onFocus());await act(async()=>input.props.onChange({target:{value:query}}));
 await act(async()=>input.props.onKeyDown({key:'ArrowDown',preventDefault(){}}));await act(async()=>input.props.onKeyDown({key:'Enter',preventDefault(){}}));
}
test('composer submits the preview UTC and zone once for all selected accounts, immediate and draft omit them',async()=>{
 await withFacebookUI(<ComposerForm token="test" workspaces={facebookWorkspaces}/>,async({view,requests}:any)=>{
   await prepare(view);await choose(view,'America/New_York');
   await act(async()=>view.root.findByProps({'aria-label':'当地日期'}).props.onChange({target:{value:'2099-10-20'}}));
   await act(async()=>view.root.findByProps({'aria-label':'当地小时'}).props.onChange({target:{value:'20'}}));
   assert.ok(facebookText(view).includes('2099-10-21 08:00'));
   await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
   const sent=requests.filter((r:any)=>r.method==='POST').at(-1).body;
   assert.equal(sent.scheduledAt,'2099-10-21T00:00:00.000Z');assert.equal(sent.timezone,'America/New_York');assert.equal(sent.variants.length,2);
   for(const mode of ['立即发布','保存草稿']){
    await act(async()=>facebookButton(view,mode).props.onClick());
    await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
    const body=requests.filter((r:any)=>r.method==='POST').at(-1).body;
    assert.equal(body.scheduledAt,undefined);assert.equal(body.timezone,undefined);
   }
 },composerResponse);
});
test('composer refuses nonempty invalid time instead of silently saving a draft',async()=>{
 await withFacebookUI(<ComposerForm token="test" workspaces={facebookWorkspaces}/>,async({view,requests}:any)=>{
   await prepare(view);
   await act(async()=>view.root.findByProps({'aria-label':'当地日期'}).props.onChange({target:{value:'2099-02-30'}}));
   await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
   assert.equal(requests.filter((r:any)=>r.method==='POST').length,0);
 },composerResponse);
});

test('empty scheduled mode saves draft and workspace or copied content resets the previous time',async()=>{
 function Harness(){const [copy,setCopy]=useState<string|null>(null);return <><button type="button" onClick={()=>setCopy('copied')}>copy fixture</button><ComposerForm token="test" workspaces={[...facebookWorkspaces,{...facebookWorkspaces[0],id:'w2'}]} copyPostId={copy}/></>;}
 await withFacebookUI(<Harness/>,async({view,requests}:any)=>{
   await prepare(view);
   await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
   assert.equal(requests.filter((r:any)=>r.method==='POST').at(-1).body.scheduledAt,undefined);
   await choose(view,'America/New_York');
   await act(async()=>view.root.findByProps({'aria-label':'当地日期'}).props.onChange({target:{value:'2099-10-20'}}));
   await act(async()=>facebookButton(view,'copy fixture').props.onClick());
   await act(async()=>facebookButton(view,'定时发布').props.onClick());
   assert.equal(view.root.findByProps({'aria-label':'当地日期'}).props.value,'');
   assert.ok(view.root.findByProps({'aria-label':'发布地区与时区'}).props.value.includes('Asia/Shanghai'));
   await act(async()=>view.root.findByProps({'aria-label':'当地日期'}).props.onChange({target:{value:'2099-10-20'}}));
   const workspace=view.root.findAllByType('select').find((n:any)=>n.props.value==='w1');
   await act(async()=>workspace.props.onChange({target:{value:'w2'}}));
   await act(async()=>facebookButton(view,'定时发布').props.onClick());
   assert.equal(view.root.findByProps({'aria-label':'当地日期'}).props.value,'');
 },(url,init)=>url.pathname.endsWith('/composer/posts/copied')?Response.json({id:'copied',baseText:'copy',title:null,variants:[{...accounts[0],socialAccountId:'a1',text:'copy',media:[],platformPayload:{},schedules:[{scheduledAt:'2000-01-01T00:00:00Z',timezone:'America/New_York'}]}]}):composerResponse(url,init));
});

test('submission rechecks the actual clock after the preview was valid',async t=>{
 let now=Date.parse('2099-01-01T00:00:00Z');t.mock.method(Date,'now',()=>now);
 await withFacebookUI(<ComposerForm token="test" workspaces={facebookWorkspaces}/>,async({view,requests}:any)=>{
   await prepare(view);
   await act(async()=>view.root.findByProps({'aria-label':'当地日期'}).props.onChange({target:{value:'2099-01-01'}}));
   await act(async()=>view.root.findByProps({'aria-label':'当地小时'}).props.onChange({target:{value:'09'}}));
   now=Date.parse('2099-01-01T02:00:00Z');
   await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
   assert.equal(requests.filter((r:any)=>r.method==='POST').length,0);
 },composerResponse);
});
