import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {act} from 'react-test-renderer';
import {withFacebookUI,facebookButton,facebookText} from './helpers/facebookManagementUI';
import {SocialAccountProfileLink} from '../components/social/SocialAccountProfileLink';
import {LanguageProvider} from '../components/LanguageProvider';

const props={platform:'tiktok',accountId:'test-account',token:'test-session',workspaceId:'test-workspace',accountStatus:'active'};
const element=(extra={})=>React.createElement(SocialAccountProfileLink,{...props,...extra} as any);
const status={eligible:true,connected:true,profileGranted:true,accountId:'test-account'};
const profile={status:'ok',username:'andypeng97',profileUrl:'https://www.tiktok.com/@andypeng97'};

test('exact designated account offers a manual profile read without automatic OAuth or publishing',async()=>{
 await withFacebookUI(element(),async({view,requests}:any)=>{
  assert.ok(facebookButton(view,'获取主页链接'));
  assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');
  await act(async()=>facebookButton(view,'获取主页链接').props.onClick());
  assert.ok(facebookText(view).includes('andypeng97'));
  assert.equal(view.root.findByType('a').props.href,profile.profileUrl);
  assert.deepEqual(requests.map((r:any)=>r.method),['GET','GET']);
  assert.ok(requests[1].path.endsWith('/tiktok-sandbox/profile'));
 },u=>Response.json(u.pathname.endsWith('/status')?status:profile));
});

test('ineligible, mismatched and failed status responses never offer test authorization',async()=>{
 for(const response of [{eligible:false,connected:false},{...status,accountId:'other'}, {eligible:true,connected:true}]){
  await withFacebookUI(element(),async({view}:any)=>{assert.equal(facebookButton(view,'获取主页链接'),undefined);assert.equal(facebookButton(view,'授权主页信息'),undefined);},()=>Response.json(response));
 }
 await withFacebookUI(element({platform:'instagram'}),async({requests}:any)=>assert.equal(requests.length,0),()=>{throw Error('No test request allowed');});
});

test('missing profile grant uses independent OAuth only on click and rejects unsafe authorization destinations',async()=>{
 const destinations:string[]=[];
 await withFacebookUI(element(),async({view,requests}:any)=>{
  (globalThis as any).window.location.assign=(v:string)=>destinations.push(v);
  assert.ok(facebookButton(view,'授权主页信息'));assert.equal(requests.length,1);
  await act(async()=>facebookButton(view,'授权主页信息').props.onClick());
  assert.equal(destinations.length,0);assert.ok(facebookText(view).includes('重试'));
  assert.equal(requests[1].method,'POST');assert.ok(requests[1].path.endsWith('/tiktok-sandbox/oauth/start'));
 },u=>Response.json(u.pathname.endsWith('/status')?{...status,connected:false,profileGranted:false}:{authorizationUrl:'https://evil.example/authorize'}));
});

test('unverified profile URLs are not rendered and missing permission switches back to independent authorization',async()=>{
 for(const result of [{...profile,profileUrl:'https://evil.example/@andypeng97'},{status:'permission_missing'}]){
  await withFacebookUI(element(),async({view}:any)=>{
   await act(async()=>facebookButton(view,'获取主页链接').props.onClick());
   assert.equal(view.root.findAllByType('a').length,0);
   if(result.status==='permission_missing')assert.ok(facebookButton(view,'授权主页信息'));
  },u=>Response.json(u.pathname.endsWith('/status')?status:result));
 }
});

test('valid independent OAuth navigates to TikTok and a failed second read clears previous profile',async()=>{
 const destinations:string[]=[];
 const auth='https://www.tiktok.com/v2/auth/authorize/?state=independent-state';
 await withFacebookUI(element(),async({view}:any)=>{
  (globalThis as any).window.location.assign=(v:string)=>destinations.push(v);
  await act(async()=>facebookButton(view,'授权主页信息').props.onClick());
  assert.deepEqual(destinations,[auth]);
 },u=>Response.json(u.pathname.endsWith('/status')?{...status,connected:false}:{authorizationUrl:auth}));
 let reads=0;
 await withFacebookUI(element(),async({view}:any)=>{
  await act(async()=>facebookButton(view,'获取主页链接').props.onClick());
  assert.equal(view.root.findAllByType('a').length,1);
  await act(async()=>facebookButton(view,'获取主页链接').props.onClick());
  assert.equal(view.root.findAllByType('a').length,0);
 },u=>Response.json(u.pathname.endsWith('/status')?status:++reads===1?profile:{status:'temporarily_unavailable'}));
});

test('workspace change discards late profile data and repeated clicks do not duplicate requests',async()=>{
 let resolve!: (value:Response)=>void;
 const pending=new Promise<Response>(r=>resolve=r);
 await withFacebookUI(element(),async({view,requests}:any)=>{
  const button=facebookButton(view,'获取主页链接');
  await act(async()=>{button.props.onClick();button.props.onClick();});
  assert.equal(requests.filter((r:any)=>r.path.endsWith('/profile')).length,1);
  await act(async()=>view.update(<LanguageProvider>{element({workspaceId:'other-workspace'})}</LanguageProvider>));
  await act(async()=>resolve(Response.json(profile)));
  assert.equal(view.root.findAllByType('a').length,0);
  assert.ok(!facebookText(view).includes('andypeng97'));
 },u=>u.pathname.includes('/other-workspace/')?Response.json({eligible:false,connected:false}):u.pathname.endsWith('/status')?Response.json(status):pending);
});
