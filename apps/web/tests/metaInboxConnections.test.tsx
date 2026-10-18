import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {act} from 'react-test-renderer';
import {withInboxUI,inboxAccount} from './helpers/interactionInboxUI';import {facebookText,facebookButton} from './helpers/facebookManagementUI';
import {LanguageProvider} from '../components/LanguageProvider';
const ig={...inboxAccount,id:'44444444-4444-4444-8444-444444444444',platform:'instagram',name:'Instagram test',capabilities:[{capability:'messages.read',available:true,reason:'available',verifiedAt:null},{capability:'messages.reply',available:false,reason:'authorization_required',verifiedAt:null}]};
const status={enabled:true,connected:false,status:'authorization_required',connectionId:null,providerAccountId:'100',displayName:'Instagram test',expiresAt:null};
async function panel(){const m=await import('../components/inbox/unified/InteractionConnectionPanel').catch(()=>null);assert.ok(m,'independent connection panel required');return m.InteractionConnectionPanel;}

test('newConnectionNotPublishingRebind',async()=>{
 const Panel=await panel();let navigated='';await withInboxUI(<Panel token="test" workspaceId="w1" account={ig} onChanged={()=>{}}/>,async({view,requests,storage}:any)=>{
  (globalThis as any).window.location.assign=(url:string)=>{navigated=url;};assert.match(facebookText(view),/独立互动授权/);assert.match(facebookText(view),/发布授权保持不变/);assert.ok(requests.every((r:any)=>r.method==='GET'));
  await act(async()=>facebookButton(view,'连接独立互动授权').props.onClick());assert.match(navigated,/^https:\/\/www.instagram.com\/oauth\/authorize/);assert.deepEqual(requests.filter((r:any)=>r.method==='POST').map((r:any)=>({path:r.path,body:r.body})),[{path:'/api/v1/workspaces/w1/instagram-management/oauth/start',body:{accountId:ig.id}}]);assert.ok(storage.every((v:any)=>!String(v[1]).includes('test')));
 },url=>url.pathname.endsWith('/oauth/start')?Response.json({authorizationUrl:'https://www.instagram.com/oauth/authorize?client_id=456&state=synthetic'}):url.pathname.includes('/instagram-management/status')?Response.json(status):undefined);
});

test('cancelOAuthKeepsPublishingAndDraft',async()=>{
 const Panel=await panel();let confirmations=0;await withInboxUI(<Panel token="test" workspaceId="w1" account={ig} onChanged={()=>{}} onBeforeNavigate={()=>{confirmations++;return false;}}/>,async({view,requests}:any)=>{
  await act(async()=>facebookButton(view,'连接独立互动授权').props.onClick());assert.equal(confirmations,1);assert.equal(requests.filter((r:any)=>r.method!=='GET').length,0);
 },url=>url.pathname.includes('/instagram-management/status')?Response.json(status):undefined);
});

test('readAllowedSendDisabledExplainedAndRefreshNeverSubscribes',async()=>{
 const Panel=await panel();await withInboxUI(<Panel token="test" workspaceId="w1" account={ig} onChanged={()=>{}}/>,async({view,requests}:any)=>{
  assert.match(facebookText(view),/可读取/);assert.match(facebookText(view),/回复暂不可用/);assert.match(facebookText(view),/等待接入核验/);await act(async()=>facebookButton(view,'刷新授权状态').props.onClick());assert.ok(requests.every((r:any)=>r.method==='GET'));assert.ok(requests.every((r:any)=>!r.path.includes('subscriptions')));
 },url=>url.pathname.includes('/instagram-management/status')?Response.json({...status,connected:true,status:'verification_required',connectionId:'conn-1'}):undefined);
});

test('lateStatusFromPreviousAccountIgnored',async()=>{
 const Panel=await panel();let finish!:(r:Response)=>void;await withInboxUI(<Panel token="test" workspaceId="w1" account={ig} onChanged={()=>{}}/>,async({view}:any)=>{
  await act(async()=>view.update(<LanguageProvider><Panel token="test" workspaceId="w1" account={{...ig,id:'55555555-5555-4555-8555-555555555555',name:'Current account'}} onChanged={()=>{}}/></LanguageProvider>));
  await act(async()=>finish(Response.json({...status,connected:true,status:'authorization_expired',connectionId:'old'})));assert.match(facebookText(view),/Current account/);assert.doesNotMatch(facebookText(view),/互动授权已过期/);
 },url=>url.pathname.includes('/instagram-management/status')?(url.searchParams.get('accountId')===ig.id?new Promise(resolve=>{finish=resolve;}):Response.json({...status,connected:true,status:'verification_required'})):undefined);
});

test('disconnectRequiresConfirmationAndOnlyTouchesTheIndependentConnection',async()=>{
 const Panel=await panel();await withInboxUI(<Panel token="test" workspaceId="w1" account={ig} onChanged={()=>{}}/>,async({view,requests}:any)=>{
  (globalThis as any).window.confirm=()=>false;await act(async()=>facebookButton(view,'断开独立互动连接').props.onClick());assert.equal(requests.filter((r:any)=>r.method==='DELETE').length,0);
  (globalThis as any).window.confirm=()=>true;await act(async()=>facebookButton(view,'断开独立互动连接').props.onClick());assert.deepEqual(requests.filter((r:any)=>r.method==='DELETE').map((r:any)=>r.path),['/api/v1/workspaces/w1/instagram-management/connections/conn-1']);assert.ok(requests.every((r:any)=>!r.path.includes('/social-accounts')));
 },url=>url.pathname.includes('/instagram-management/status')?Response.json({...status,connected:true,status:'verification_required',connectionId:'conn-1'}):url.pathname.endsWith('/connections/conn-1')?Response.json({disconnected:true}):undefined);
});

test('oauthNeverNavigatesToAnUntrustedOriginAndViewersCannotMutate',async()=>{
 const Panel=await panel();let navigated=0;await withInboxUI(<Panel token="test" workspaceId="w1" account={ig} onChanged={()=>{}}/>,async({view}:any)=>{(globalThis as any).window.location.assign=()=>{navigated++;};await act(async()=>facebookButton(view,'连接独立互动授权').props.onClick());assert.equal(navigated,0);assert.match(facebookText(view),/独立授权操作未完成/);
  await act(async()=>view.update(<LanguageProvider><Panel token="test" workspaceId="w1" account={ig} onChanged={()=>{}} canManage={false}/></LanguageProvider>));assert.equal(facebookButton(view,'连接独立互动授权').props.disabled,true);
 },url=>url.pathname.endsWith('/oauth/start')?Response.json({authorizationUrl:'https://evil.test/oauth/authorize'}):url.pathname.includes('/instagram-management/status')?Response.json(status):undefined);
});

test('expiredIndependentConnectionCannotDisplayStaleReadableCapabilities',async()=>{
 const Panel=await panel();await withInboxUI(<Panel token="test" workspaceId="w1" account={ig} onChanged={()=>{}}/>,async({view}:any)=>{assert.match(facebookText(view),/互动授权已过期/);assert.match(facebookText(view),/读取暂不可用/);assert.doesNotMatch(facebookText(view),/可读取已核验/);},url=>url.pathname.includes('/instagram-management/status')?Response.json({...status,connected:true,status:'authorization_expired'}):undefined);
});
