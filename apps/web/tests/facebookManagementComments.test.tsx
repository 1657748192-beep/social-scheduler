import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {act} from 'react-test-renderer';
import {FacebookPostComments} from '../components/posts/FacebookPostComments';
import {PublishedPostManager} from '../components/posts/PublishedPostManager';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {withFacebookUI,facebookButton,facebookText,defaultFacebookResponse} from './helpers/facebookManagementUI';
const comments=(overrides:any={})=><FacebookPostComments {...{token:'token',workspaceId:'w1',managedPageId:'p1',connectionId:'c1',scheduleId:'schedule',providerPostId:'100_1',pageName:'First Page',role:'owner',...overrides} as any}/>;

test('historicalIdentityRequiresExplicitReadOnlyCheckAndDoesNotSuggestReauthorization',async()=>{
  let status='content_unavailable';
  await withFacebookUI(comments({providerPostId:'200'}),async({view,requests}:any)=>{
    await act(async()=>facebookButton(view,'Facebook 评论').props.onClick());
    assert.equal(requests.filter((r:any)=>r.path.endsWith('/comments')||r.path.endsWith('/availability')).length,0);
    await act(async()=>facebookButton(view,'重新检查').props.onClick());
    assert.match(facebookText(view),/平台内容暂不可读/);assert.doesNotMatch(facebookText(view),/已删除|请重新授权|评论读取尚未获准/);
    assert.equal(facebookButton(view,'发送回复'),undefined);
    status='readable';await act(async()=>facebookButton(view,'重新检查').props.onClick());
    assert.match(facebookText(view),/comment-p1/);
    assert.equal(requests.filter((r:any)=>r.path.endsWith('/availability')).length,2);
    assert.ok(requests.every((r:any)=>!r.body));
    assert.equal(facebookButton(view,'发送回复'),undefined);
  },url=>url.pathname.endsWith('/availability')?Response.json({status,checkedAt:'2026-10-17T05:00:00Z'}):undefined);
});
test('commentsStartCollapsedAndReadThroughIndependentPageContext',async()=>withFacebookUI(comments(),async({view,requests}:any)=>{
  assert.equal(requests.filter((r:any)=>r.path.endsWith('/comments')).length,0);
  await act(async()=>facebookButton(view,'Facebook 评论').props.onClick());assert.match(facebookText(view),/comment-p1/);
  await act(async()=>view.root.findByProps({'aria-label':'回复评论 100_10'}).props.onChange({target:{value:'Manual comment reply'}}));
  const send=facebookButton(view,'发送回复').props.onClick;await act(async()=>{void send();void send();});
  const posts=requests.filter((r:any)=>r.path.endsWith('/replies'));assert.equal(posts.length,1);assert.ok(posts[0].path.includes('/facebook-management/pages/p1/posts/schedule/comments/100_10/replies'));assert.match(posts[0].body.requestKey,/^[0-9a-f-]{36}$/i);
}));
test('lateCommentReplyAndReadCannotPolluteAnotherPage',async()=>{
  let release!:(r:Response)=>void,hold=false,releaseRead!:(r:Response)=>void;
  await withFacebookUI(comments(),async({view}:any)=>{
    await act(async()=>facebookButton(view,'Facebook 评论').props.onClick());await act(async()=>view.root.findByProps({'aria-label':'回复评论 100_10'}).props.onChange({target:{value:'old draft'}}));
    await act(async()=>facebookButton(view,'发送回复').props.onClick());hold=true;await act(async()=>facebookButton(view,'读取评论').props.onClick());
    await act(async()=>view.update(<LanguageProviderWrapper>{comments({managedPageId:'p2',connectionId:'c2',scheduleId:'second',providerPostId:'200_1',pageName:'Second Page'})}</LanguageProviderWrapper>));
    await act(async()=>facebookButton(view,'Facebook 评论').props.onClick());assert.match(facebookText(view),/comment-p2/);
    await act(async()=>{release(Response.json({status:'sent',providerId:'old-sent'}));releaseRead(defaultFacebookResponse(new URL('http://localhost/api/v1/workspaces/w1/facebook-management/pages/p1/posts/schedule/comments')));});
    assert.doesNotMatch(facebookText(view),/comment-p1|old draft|回复已发送/);
  },url=>url.pathname.endsWith('/replies')?new Promise<Response>(r=>{release=r;}):hold&&url.pathname.includes('/p1/')&&url.pathname.endsWith('/comments')?new Promise<Response>(r=>{releaseRead=r;}):undefined);
});
import {LanguageProvider as LanguageProviderWrapper} from '../components/LanguageProvider';
test('viewerAndMissingRealPostRemainReadOnlyAndUnknownCommentIsNotRetried',async()=>{
  await withFacebookUI(comments({role:'viewer'}),async({view}:any)=>{await act(async()=>facebookButton(view,'Facebook 评论').props.onClick());assert.match(facebookText(view),/comment-p1/);assert.equal(facebookButton(view,'发送回复'),undefined);});
  await withFacebookUI(comments({providerPostId:null}),async({view,requests}:any)=>{await act(async()=>facebookButton(view,'Facebook 评论').props.onClick());assert.match(facebookText(view),/真实帖子 ID/);assert.equal(requests.filter((r:any)=>r.path.endsWith('/comments')).length,0);});
  await withFacebookUI(comments(),async({view,requests}:any)=>{await act(async()=>facebookButton(view,'Facebook 评论').props.onClick());await act(async()=>view.root.findByProps({'aria-label':'回复评论 100_10'}).props.onChange({target:{value:'Reply'}}));await act(async()=>facebookButton(view,'发送回复').props.onClick());assert.match(facebookText(view),/结果未知|待核实/);await act(async()=>facebookButton(view,'读取评论').props.onClick());assert.equal(requests.filter((r:any)=>r.path.endsWith('/replies')).length,1);},url=>url.pathname.endsWith('/replies')?Response.json({status:'unknown',diagnosticId:'fixture'}):undefined);
});

test('publishedManagerShowsOnlyBoundVerifiedFacebookEntryAndNeverRestoresInstagram',async()=>{
  const oldSelf=(globalThis as any).self;(globalThis as any).self={setTimeout:()=>1,clearTimeout(){}};
  const post=(id:string,overrides:any={})=>({id,postId:'post-'+id,title:id,baseText:id,text:id,platform:'facebook',providerPostId:'100_1',socialAccount:{id:'publishing-p1',displayName:'First Page',platform:'facebook'},media:[],scheduledAt:'2026-10-16T08:00:00Z',publishedAt:'2026-10-16T08:00:00Z',...overrides});
  const router={back(){},forward(){},refresh(){},push(){},replace(){},prefetch:async()=>{}};
  try{await withFacebookUI(<AppRouterContext.Provider value={router}><PublishedPostManager token="token" workspaces={[{id:'w1',name:'Workspace',role:'owner'} as any]}/></AppRouterContext.Provider>,async({view,requests}:any)=>{
    assert.equal(view.root.findAllByType('button').filter((button:any)=>button.children.join('')==='Facebook 评论').length,2);
    assert.ok(requests.every((r:any)=>!r.path.includes('instagram/reception')&&!r.path.includes('instagram-engagement')));
    assert.equal(requests.filter((r:any)=>r.path.endsWith('/comments')).length,0);
  },url=>url.pathname.endsWith('/published-posts')?Response.json([post('real'),post('historical',{providerPostId:'200'}),post('wrong-page',{providerPostId:'999_1'}),post('simulated',{providerPostId:'mock-facebook'}),post('removed',{socialAccount:null}),post('foreign',{socialAccount:{id:'other-account',displayName:'Same name',platform:'facebook'}}),post('instagram',{platform:'instagram',socialAccount:{id:'ig',platform:'instagram',displayName:'Instagram'}})]):url.pathname.endsWith('/social-accounts')?Response.json([{id:'publishing-p1',platform:'facebook',accountType:'page',status:'active',displayName:'First Page'}]):undefined);
  }finally{(globalThis as any).self=oldSelf;}
});
