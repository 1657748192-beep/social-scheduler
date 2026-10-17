import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {act} from 'react-test-renderer';
import {SocialAccountManager} from '../components/social/SocialAccountManager';
import {LanguageProvider} from '../components/LanguageProvider';
import {withFacebookUI,facebookText,facebookButton,envelope} from './helpers/facebookManagementUI';
import type {SocialAccount} from '../lib/api';

const account=(platform:SocialAccount['platform'],scopes?:string[],extra:Partial<SocialAccount>={}):SocialAccount=>({id:'account-1',platform,providerAccountId:'100',accountType:platform==='facebook'?'page':undefined,displayName:'Current account',status:'active',createdAt:'2026-01-01T00:00:00Z',capabilities:{profileSync:{lastAttemptAt:new Date().toISOString()}},...(scopes?{credential:{scopes,updatedAt:'2026-02-01T00:00:00Z'}}:{}),...extra});
const panel=(a:SocialAccount,extra:any={})=><SocialAccountManager accounts={[a]} providers={[]} workspaceId="w1" token="test-token" canManage loading={false} failed={false} onAdd={()=>{throw Error('must not authorize');}} onDisconnect={async()=>{throw Error('must not disconnect');}} {...extra}/>;
const open=async(view:any)=>act(async()=>view.root.findByProps({'aria-label':'查看 Current account 详情'}).props.onClick());
const feature=(view:any,label:string)=>view.root.findByProps({'aria-label':label,'data-account-feature':true});
const state=(view:any,label:string)=>feature(view,label).findByProps({'data-feature-state':true}).children.join('');
const publishing=['pages_manage_posts','pages_read_engagement'];
const page={id:'managed-1',connectionId:'connection-1',pageId:'100',name:'Different current name',publishingAccountId:'account-1',authorization:'available',selectedManagedPageId:'managed-1',businesses:[]};
const caps={readComments:{status:'available'},replyComments:{status:'missing'},readMessages:{status:'unknown'},replyMessages:{status:'available'},subscription:{status:'available'}};

test('customer details retain Chinese functions but do not render technical identifiers or scope names',async()=>{
 const a=account('tiktok',['user.info.basic','video.publish','user.info.stats','video.list']);const original=JSON.stringify(a);
 await withFacebookUI(panel(a),async({view,requests}:any)=>{
  await open(view);
  assert.equal(state(view,'读取头像和昵称'),'已授权');assert.equal(state(view,'直接发布视频'),'已授权');
  assert.equal(state(view,'读取账号统计'),'已授权');assert.equal(state(view,'读取公开视频'),'已授权');
  assert.equal(state(view,'读取主页资料'),'未记录授权');assert.equal(state(view,'上传为 TikTok 草稿'),'未记录授权');
  assert.equal(view.root.findAllByType('details').length,0);
  assert.doesNotMatch(facebookText(view),/技术详情|平台账号 ID|访问凭证到期时间|凭据更新时间|user\.info\.basic|video\.publish/);
  assert.equal(view.root.findAllByProps({'aria-label':'授权功能'}).length,1);
  assert.equal(requests.length,0);assert.equal(JSON.stringify(a),original);
 });
});

test('Instagram, YouTube and Pinterest show only their own functions and do not infer grants from connected status',async()=>{
 const cases=[
  ['instagram',['instagram_business_basic','instagram_business_content_publish'],'发布内容','读取和回复评论'],
  ['youtube',['https://www.googleapis.com/auth/youtube.readonly'],'读取频道资料','上传发布视频'],
  ['pinterest',['user_accounts:read','boards:read','pins:write'],'发布 Pin','创建画板']
 ] as const;
 for(const [platform,scopes,yes,no] of cases)await withFacebookUI(panel(account(platform,[...scopes])),async({view,requests}:any)=>{
  await open(view);assert.equal(state(view,yes),'已授权');assert.equal(state(view,no),'未记录授权');
  assert.doesNotMatch(facebookText(view),/读取粉丝数|私信数|暂无标签/);assert.equal(requests.length,0);
 });
});

test('absent grant records, stale access credentials and invalid connections never appear as current authorization',async()=>{
 for(const [a,want] of [
  [account('tiktok',undefined,{capabilities:{scopes:['video.publish']}}),'待核实'],
  [account('tiktok',[]),'待核实'],
  [account('tiktok',['video.publish'],{status:'authorization_invalid'}),'授权已失效'],
  [account('tiktok',['video.publish'],{status:'token_expired'}),'授权已失效'],
  [account('tiktok',['video.publish'],{status:'disconnected'}),'待核实'],
  [account('tiktok',['video.publish'],{status:'permission_missing'}),'待核实'],
  [account('tiktok',['video.publish'],{credential:{scopes:['video.publish'],expiresAt:'2020-01-01T00:00:00Z',updatedAt:'2020-01-01T00:00:00Z'}}),'待核实']
 ] as const)await withFacebookUI(panel(a),async({view,requests}:any)=>{
  await open(view);assert.equal(state(view,'直接发布视频'),want);assert.equal(requests.length,0);
 });
});

test('Facebook publishing and independent management use exact account and Page identities with GET-only checks',async()=>{
 await withFacebookUI(panel(account('facebook',publishing)),async({view,requests}:any)=>{
  assert.equal(requests.length,0);await open(view);
  assert.equal(state(view,'发布公共主页帖子'),'已授权');
  assert.equal(state(view,'读取评论'),'已核实可用');assert.equal(state(view,'回复评论'),'权限或角色受限');
  assert.equal(state(view,'读取私信'),'待核实');assert.equal(state(view,'回复私信'),'已核实可用');
  assert.match(facebookText(view),/Facebook 独立管理授权/);assert.match(facebookText(view),/消息窗口/);
  assert.deepEqual(requests.map((r:any)=>r.method),['GET','GET','GET']);
  assert.match(requests[2].path,/pages\/managed-1\/capabilities$/);
 },url=>url.pathname.endsWith('/pages')?Response.json(envelope([page])):url.pathname.endsWith('/capabilities')?Response.json(caps):undefined);
});

test('unmatched or unselected Facebook records cannot borrow a similarly named Page grant',async()=>{
 for(const wrong of [{...page,pageId:'200',name:'Current account'},{...page,publishingAccountId:'other'},{...page,selectedManagedPageId:'other'}]){
  await withFacebookUI(panel(account('facebook',publishing)),async({view,requests}:any)=>{
   await open(view);assert.equal(state(view,'读取评论'),'待核实');
   assert.equal(requests.some((r:any)=>r.path.endsWith('/capabilities')),false);
  },url=>url.pathname.endsWith('/pages')?Response.json(envelope([wrong])):undefined);
 }
});

test('Facebook failures and expired management grants remain separate from publishing permissions',async()=>{
 for(const mode of ['failed','expired','disabled'])await withFacebookUI(panel(account('facebook',publishing)),async({view,requests}:any)=>{
  await open(view);assert.equal(state(view,'发布公共主页帖子'),'已授权');
  assert.equal(state(view,'读取评论'),mode==='expired'?'授权已失效':'待核实');
  assert.ok(requests.every((r:any)=>r.method==='GET'));
 },url=>url.pathname.endsWith('/status')&&mode==='disabled'?Response.json({enabled:false,configured:false}):url.pathname.endsWith('/pages')?Response.json(envelope([{...page,authorization:mode==='expired'?'expired':'available'}])):url.pathname.endsWith('/capabilities')?Response.json({message:'unavailable'},{status:502}):undefined);
});

test('late Facebook permission response is ignored after switching account or workspace',async()=>{
 let finish!:(response:Response)=>void;
 await withFacebookUI(panel(account('facebook',publishing)),async({view,requests}:any)=>{
  await open(view);assert.ok(requests.some((r:any)=>r.path.endsWith('/capabilities')));
  await act(async()=>view.update(<LanguageProvider>{panel(account('tiktok',['user.info.basic']),{workspaceId:'w2'})}</LanguageProvider>));
  await open(view);await act(async()=>finish(Response.json(caps)));
  assert.equal(state(view,'读取头像和昵称'),'已授权');assert.equal(view.root.findAllByProps({'aria-label':'读取评论','data-account-feature':true}).length,0);
 },url=>url.pathname.endsWith('/pages')?Response.json(envelope([page])):url.pathname.endsWith('/capabilities')?new Promise<Response>(resolve=>{finish=resolve;}):undefined);
});

test('viewers can read permission summaries but have no disconnect or authorization controls',async()=>{
 await withFacebookUI(panel(account('instagram',['instagram_business_basic']),{canManage:false}),async({view,requests}:any)=>{
  await open(view);assert.equal(state(view,'读取账号资料'),'已授权');
  assert.equal(facebookButton(view,'解除绑定'),undefined);assert.equal(facebookButton(view,'重新授权'),undefined);
  assert.equal(requests.length,0);
 });
});

test('viewer keyboard navigation wraps safely when the hidden technical section leaves only Close',async()=>{
 let document:any;
 const close={focus(){if(document)document.activeElement=close;},getClientRects:()=>[{}]};
 const nodeMock=(element:any)=>element.props.role==='dialog'?{
  querySelector:()=>close,
  querySelectorAll:()=>[close]
 }:null;
 await withFacebookUI(panel(account('instagram',['instagram_business_basic']),{canManage:false}),async(f:any)=>{
  document=f.document;await open(f.view);document.activeElement=close;
  const dialog=f.view.root.findByProps({role:'dialog'});let prevented=false;
  dialog.props.onKeyDown({key:'Tab',shiftKey:false,preventDefault(){prevented=true;}});
  assert.equal(f.view.root.findAllByType('summary').length,0);
  assert.equal(prevented,true);assert.equal(document.activeElement,close);
 },undefined,nodeMock);
});

test('hiding technical details preserves renewal warnings and expired authorization states without requests',async()=>{
 for(const [expiry,want] of [[new Date(Date.now()+3*86400000).toISOString(),'续期凭证即将到期'],['2020-01-01T00:00:00Z','续期凭证已到期']]){
  await withFacebookUI(panel(account('tiktok',['user.info.basic'],{credential:{scopes:['user.info.basic'],refreshTokenExpiresAt:expiry,updatedAt:'2026-01-01T00:00:00Z'}})),async({view,requests}:any)=>{
   await open(view);assert.match(facebookText(view),new RegExp(want));assert.equal(view.root.findAllByType('details').length,0);assert.equal(requests.length,0);
  });
 }
});
