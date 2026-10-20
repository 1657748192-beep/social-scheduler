import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {FacebookManagementPanel} from '../components/facebook/FacebookManagementPanel';
import {LanguageProvider} from '../components/LanguageProvider';
import {safeFacebookProfileUrl,safeFacebookAvatarUrl,type FacebookManagedPage} from '../lib/facebookManagement';
const workspaces=[{id:'w1',name:'First',role:'owner'},{id:'w2',name:'Second',role:'owner'}] as any;
const rows=():FacebookManagedPage[]=>Array.from({length:21},(_,i)=>({id:`p${i}`,connectionId:'c1',pageId:String(100+i),name:`Page ${i}`,profileUrl:'https://www.facebook.com/100',avatarUrl:null,businesses:i<10?[{id:'b1',name:'Business One',relation:'owned'}]:i<20?[{id:'b2',name:'Business Two',relation:'client'}]:[],publishingAccountId:i===0?'publishing-account':null,authorization:i===20?'missing':'available',lastReadAt:'2026-10-16T08:00:00.000Z',selectedManagedPageId:null,connectionChoices:[{managedPageId:`p${i}`,connectionId:'c1',available:true},...(i===0?[{managedPageId:'p-second',connectionId:'c2',available:true}]:[])]}));
async function environment(run:(f:any)=>Promise<void>,options:{viewer?:boolean;delayed?:boolean;paged?:boolean;empty?:boolean;initialFailure?:boolean;unsafe?:boolean}={}){
  const old={fetch:globalThis.fetch,window:(globalThis as any).window,document:(globalThis as any).document};
  (globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  (globalThis as any).window={localStorage:{getItem:()=>null,setItem(){},removeItem(){}},dispatchEvent(){},location:{pathname:'/facebook-management',search:'',assign(){}}};
  (globalThis as any).document={documentElement:{lang:''},visibilityState:'visible'};
  const requests:Array<{path:string;method:string;body:any}>=[];let items=options.empty?[]:rows(),stale=false,release!:(r:Response)=>void;let view:ReactTestRenderer;
  if(options.unsafe)items=items.map((p,i)=>i===0?{...p,profileUrl:'javascript:alert(1)',avatarUrl:'https://evil.test/avatar.jpg'}:i===1?{...p,avatarUrl:'https://scontent.fbcdn.net/avatar.jpg'}:p);
  globalThis.fetch=async(raw,init)=>{
    const url=new URL(String(raw)),path=url.pathname;requests.push({path,method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):null});
    if(path.endsWith('/status'))return Response.json({enabled:true,configured:true});
    if(path.endsWith('/connections'))return Response.json([{id:'c1',authorizedBy:'Andy',ownConnection:true,status:'active',createdAt:'2026-10-16T08:00:00Z',lastReadAt:null},{id:'c2',authorizedBy:'Other',ownConnection:false,status:'active',createdAt:'2026-10-16T08:00:00Z',lastReadAt:null}]);
    if(path.endsWith('/refresh')){stale=true;return Response.json({items,stale:true});}
    if(path.endsWith('/select')){items=items.map(p=>p.pageId==='100'?{...p,selectedManagedPageId:'p-second'}:p);return Response.json({managedPageId:'p-second'});}
    if(path.endsWith('/disconnect'))return Response.json({disconnected:true});
    if(path.endsWith('/pages')){
      if(options.initialFailure)return Response.json({message:'Fixture directory unavailable'},{status:502});
      if(options.delayed&&path.includes('/w1/'))return new Promise<Response>(r=>{release=r;});
      const start=Number(url.searchParams.get('cursor')??0),visible=path.includes('/w2/')?[{...rows()[0],name:'Second workspace Page'}]:items;
      return Response.json({items:options.paged?visible.slice(start,start+7):visible,nextCursor:options.paged&&start+7<visible.length?String(start+7):null,readAt:'2026-10-16T08:00:00.000Z',source:'graph',stale,warnings:stale?[{code:'directory_refresh_failed',diagnosticId:'fixture'}]:[]});
    }
    throw Error('Unexpected fixture endpoint');
  };
  try{
    await act(async()=>{view=create(<LanguageProvider><FacebookManagementPanel token="software-token-never-render" workspaces={options.viewer?[{...workspaces[0],role:'viewer'}]:workspaces}/></LanguageProvider>);});
    await run({view:view!,requests,release:(r:Response)=>release(r)});
  }finally{if(view!)await act(async()=>view.unmount());globalThis.fetch=old.fetch;(globalThis as any).window=old.window;(globalThis as any).document=old.document;}
}
const rendered=(view:ReactTestRenderer)=>JSON.stringify(view.toJSON());
const pages=(view:ReactTestRenderer)=>view.root.findAll(n=>n.type==='article'&&n.props.className==='facebook-page-card');
const button=(view:ReactTestRenderer,label:string)=>view.root.findAllByType('button').find(n=>n.children.join('')===label)!;

test('filtersTwentyOnePagesAndShowsIndependentStatuses',async()=>environment(async({view}:any)=>{
  assert.equal(pages(view).length,21);assert.match(rendered(view),/未识别 BM/);assert.match(rendered(view),/互动授权缺失/);assert.match(rendered(view),/发布已绑定/);
  await act(async()=>view.root.findByProps({'aria-label':'BM 筛选'}).props.onChange({target:{value:'b1'}}));assert.equal(pages(view).length,10);
  await act(async()=>view.root.findByProps({'aria-label':'BM 筛选'}).props.onChange({target:{value:''}}));
  await act(async()=>view.root.findByProps({'aria-label':'名称搜索'}).props.onChange({target:{value:'Page 20'}}));assert.equal(pages(view).length,1);
  await act(async()=>view.root.findByProps({'aria-label':'名称搜索'}).props.onChange({target:{value:''}}));
  await act(async()=>view.root.findByProps({'aria-label':'连接筛选'}).props.onChange({target:{value:'c2'}}));assert.equal(pages(view).length,1);
  await act(async()=>view.root.findByProps({'aria-label':'连接筛选'}).props.onChange({target:{value:''}}));
  await act(async()=>button(view,'刷新目录').props.onClick());assert.equal(pages(view).length,21);assert.match(rendered(view),/保留上次成功结果/);
  assert.ok(view.root.findAllByType('time').some((n:any)=>n.props.dateTime==='2026-10-16T08:00:00.000Z'));
},{paged:true}));

test('chooseConnectionAndDisconnectDoNotChangePublishingBinding',async()=>environment(async({view,requests}:any)=>{
  assert.equal(view.root.findAllByType('a').filter((n:any)=>String(n.props.href).startsWith('/facebook-inbox')).length,0);
  await act(async()=>view.root.findByProps({'aria-label':'互动连接 Page 0'}).props.onChange({target:{value:'p-second'}}));
  assert.equal(view.root.findAllByType('a').filter((n:any)=>String(n.props.href).startsWith('/facebook-inbox')).length,1);
  await act(async()=>button(view,'断开管理连接').props.onClick());assert.match(rendered(view),/不会解绑发布账号/);
  await act(async()=>button(view,'确认断开').props.onClick());
  assert.ok(requests.some((r:any)=>r.path.endsWith('/connections/c1/disconnect')&&r.method==='POST'));
  assert.ok(requests.every((r:any)=>!r.path.includes('facebook-engagement')&&!r.path.includes('/social-accounts')));
  assert.doesNotMatch(rendered(view),/software-token-never-render/);
}));

test('viewerCannotSeeConnectionMutationControls',async()=>environment(async({view}:any)=>{
  assert.equal(button(view,'连接管理授权'),undefined);assert.equal(button(view,'刷新目录'),undefined);assert.equal(button(view,'断开管理连接'),undefined);
  assert.equal(pages(view).length,21);
},{viewer:true}));

test('lateDirectoryResponseCannotOverwriteAnotherWorkspace',async()=>environment(async({view,release}:any)=>{
  await act(async()=>view.root.findByProps({'aria-label':'工作区'}).props.onChange({target:{value:'w2'}}));assert.match(rendered(view),/Second workspace Page/);
  await act(async()=>release(Response.json({items:rows(),nextCursor:null,readAt:'2026-10-16T08:00:00Z',stale:false,warnings:[],source:'graph'})));
  assert.match(rendered(view),/Second workspace Page/);assert.doesNotMatch(rendered(view),/Page 20/);
},{delayed:true}));

test('profileAndAvatarLinksAllowOnlyOfficialHttpsHosts',()=>{
  assert.equal(safeFacebookProfileUrl('https://www.facebook.com/100'),'https://www.facebook.com/100');
  assert.equal(safeFacebookAvatarUrl('https://scontent.fbcdn.net/avatar.jpg'),'https://scontent.fbcdn.net/avatar.jpg');
  for(const value of ['javascript:alert(1)','http://facebook.com/100','https://facebook.com.evil.test/100','https://facebook.com@evil.test/100']){assert.equal(safeFacebookProfileUrl(value),null);assert.equal(safeFacebookAvatarUrl(value),null);}
});

test('emptySuccessfulDirectoryIsDifferentFromInitialReadFailure',async()=>{
  await environment(async({view}:any)=>{assert.equal(pages(view).length,0);assert.match(rendered(view),/此目录尚无主页/);assert.equal(view.root.findAllByProps({role:'alert'}).length,0);},{empty:true});
  await environment(async({view}:any)=>{assert.equal(pages(view).length,0);assert.match(rendered(view),/Fixture directory unavailable/);assert.doesNotMatch(rendered(view),/此目录尚无主页/);},{initialFailure:true});
});
test('unsafeImageAndProfileUrlsAreNotRenderedAsActiveElements',async()=>environment(async({view}:any)=>{
  assert.ok(view.root.findAllByType('a').every((link:any)=>!String(link.props.href).includes('javascript:')&&!String(link.props.href).includes('evil.test')));
  const images=view.root.findAllByType('img');assert.equal(images.length,1);assert.equal(images[0].props.src,'https://scontent.fbcdn.net/avatar.jpg');
  const profile=view.root.findAllByType('a').find((link:any)=>String(link.props.href).startsWith('https://www.facebook.com/'));assert.equal(profile.props.target,'_blank');assert.equal(profile.props.rel,'noopener noreferrer');
},{unsafe:true}));
