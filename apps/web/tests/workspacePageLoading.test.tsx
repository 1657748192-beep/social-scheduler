import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {LanguageProvider} from '../components/LanguageProvider';
import Drafts from '../app/drafts/page';
import Composer from '../app/composer/page';
import Calendar from '../app/calendar/page';
import Posts from '../app/posts/page';
import {ComposerForm} from '../components/composer/ComposerForm';

async function withPage(Page:React.ComponentType,run:(f:{view:ReactTestRenderer;settle:(response:Response)=>Promise<void>;requests:string[];redirects:string[]})=>Promise<void>,other?:(path:string)=>Response|Promise<Response>|undefined,options:{token?:string|null;search?:string}={}){
 const old={fetch:globalThis.fetch,window:(globalThis as any).window,document:(globalThis as any).document,localStorage:(globalThis as any).localStorage,self:(globalThis as any).self};
 (globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const storage={getItem:(key:string)=>key==='social_scheduler_token'?(options.token===undefined?'synthetic-session':options.token):key==='social_scheduler_locale'?'en':null,setItem(){},removeItem(){}};
 (globalThis as any).localStorage=storage;(globalThis as any).window={localStorage:storage,location:{search:options.search??'',protocol:'https:'},setInterval:()=>1,clearInterval(){},dispatchEvent(){},addEventListener(){},removeEventListener(){}};
 (globalThis as any).document={cookie:'social_scheduler_locale=en',documentElement:{lang:'en',removeAttribute(){}}};(globalThis as any).self={setTimeout:()=>1,clearTimeout(){}};
 const requests:string[]=[];let resolve!:(response:Response)=>void;const pending=new Promise<Response>(r=>resolve=r);
 globalThis.fetch=async(raw,init)=>{const path=new URL(String(raw)).pathname;requests.push((init?.method??'GET')+' '+path);if(path.endsWith('/workspaces'))return pending;if(path.endsWith('/auth/me'))return Response.json({name:'Preview',isPlatformAdmin:false});return await other?.(path)??Response.json([]);};
 const redirects:string[]=[];const router={back(){},forward(){},refresh(){},push(){},replace(path:string){redirects.push(path);},prefetch:async()=>{}};
 let view:ReactTestRenderer|undefined;
 try{
  await act(async()=>{view=create(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/drafts"><LanguageProvider initialLocale="en"><Page/></LanguageProvider></PathnameContext.Provider></AppRouterContext.Provider>);});
  await run({view:view!,requests,redirects,settle:async response=>{await act(async()=>{resolve(response);});}});
 }finally{if(view)await act(async()=>view!.unmount());globalThis.fetch=old.fetch;(globalThis as any).window=old.window;(globalThis as any).document=old.document;(globalThis as any).localStorage=old.localStorage;(globalThis as any).self=old.self;}
}

test('missing publishing session redirects to login without fetching a workspace or showing empty membership',async()=>{
 await withPage(Drafts,async({view,requests,redirects})=>{
  assert.deepEqual(redirects,['/login']);assert.equal(requests.length,0);assert.doesNotMatch(JSON.stringify(view.toJSON()),/No workspaces|暂无工作区/);
 },undefined,{token:null});
});

test('successful populated composer keeps the original draft, copy and workspace query semantics',async()=>{
 await withPage(Composer,async({view,settle})=>{
  await settle(Response.json([{id:'w1',name:'Workspace',role:'owner'}]));
  const form=view.root.findByType(ComposerForm);assert.equal(form.props.token,'synthetic-session');assert.equal(form.props.draftPostId,'draft-7');assert.equal(form.props.copyPostId,'copy-8');assert.equal(form.props.initialWorkspaceId,'w1');
  assert.doesNotMatch(JSON.stringify(view.toJSON()),/Loading workspaces|No workspaces|暂无工作区/);
 },undefined,{search:'?draftPostId=draft-7&copyPostId=copy-8&workspaceId=w1'});
});

test('draft read failures stay errors, while untitled and retention labels follow English without changing user content',async()=>{
 let response=Response.json({message:'读取草稿失败'},{status:503});
 await withPage(Drafts,async({view,settle,requests})=>{
  await settle(Response.json([{id:'w1',name:'Workspace',role:'owner'}]));
  let text=JSON.stringify(view.toJSON());assert.match(text,/Unable to load drafts/);assert.doesNotMatch(text,/No drafts yet|读取草稿失败/);
  response=Response.json([
   {id:'d1',title:'',baseText:'',updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+90000000).toISOString(),variants:[]},
   {id:'d2',title:'顾客原文',baseText:'原始中文',updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()-60000).toISOString(),variants:[]},
  ]);
  const button=view.root.findAllByType('button').find(b=>b.children.join('')==='Refresh');assert.ok(button);
  await act(async()=>{await button!.props.onClick();});text=JSON.stringify(view.toJSON());
  assert.match(text,/Untitled draft/);assert.match(text,/Clears in/);assert.match(text,/Clearing soon/);assert.match(text,/顾客原文/);assert.match(text,/原始中文/);
  assert.doesNotMatch(text,/未命名草稿|后清理|即将清理/);assert.ok(requests.every(r=>r.startsWith('GET ')));
 },path=>path.endsWith('/composer/drafts')?response:undefined);
});

test('loaded drafts localize generated titles and expiry labels but preserve customer Chinese text',async()=>{
 await withPage(Drafts,async({view,settle})=>{
  await settle(Response.json([{id:'w1',name:'Workspace',role:'owner'}]));const text=JSON.stringify(view.toJSON());
  assert.match(text,/Untitled draft/);assert.match(text,/Clears in/);assert.match(text,/Clearing soon/);assert.match(text,/顾客原文/);assert.doesNotMatch(text,/未命名草稿|后清理|即将清理/);
 },path=>path.endsWith('/composer/drafts')?Response.json([
  {id:'d1',title:'',baseText:'',updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+90000000).toISOString(),variants:[]},
  {id:'d2',title:'顾客原文',baseText:'原始中文',updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()-60000).toISOString(),variants:[]},
 ]):undefined);
});

test('published list failures stay localized errors rather than empty publishing history',async()=>{
 await withPage(Posts,async({view,settle})=>{
  await settle(Response.json([{id:'w1',name:'Workspace',role:'owner'}]));const text=JSON.stringify(view.toJSON());
  assert.match(text,/Unable to load published posts/);assert.doesNotMatch(text,/读取帖子失败|No published posts yet/);
 },path=>path.endsWith('/published-posts')?Response.json({message:'读取帖子失败'},{status:503}):undefined);
});

for(const [name,Page] of [['drafts',Drafts],['composer',Composer],['calendar',Calendar],['posts',Posts]] as const){
 test(`${name}: pending workspace read is English loading, only a successful empty response is empty`,async()=>{
  await withPage(Page,async({view,settle,requests})=>{
   const pending=JSON.stringify(view.toJSON());assert.match(pending,/Loading workspaces/);assert.doesNotMatch(pending,/暂无工作区|No workspaces/);
   await settle(Response.json([]));const empty=JSON.stringify(view.toJSON());assert.match(empty,/No workspaces/);assert.doesNotMatch(empty,/暂无工作区|Loading workspaces/);
   assert.ok(requests.every(r=>r.startsWith('GET ')));
  });
 });
 test(`${name}: failed workspace reads are not represented as an empty workspace or provider-language error`,async()=>{
  await withPage(Page,async({view,settle})=>{
   await settle(Response.json({message:'无法加载工作区'},{status:503}));const text=JSON.stringify(view.toJSON());assert.match(text,/Could not load workspaces/);assert.doesNotMatch(text,/暂无工作区|No workspaces|Loading workspaces|无法加载工作区/);
  });
 });
}
