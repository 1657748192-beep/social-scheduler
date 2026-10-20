import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {act} from 'react-test-renderer';
import {SocialAccountManager} from '../components/social/SocialAccountManager';
import {withFacebookUI,facebookButton,facebookText} from './helpers/facebookManagementUI';
import type {SocialAccount,OAuthProviderStatus} from '../lib/api';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import DashboardPageContent from '../components/dashboard/DashboardPageContent';

const account=(id:string,platform:SocialAccount['platform'],overrides:Partial<SocialAccount>={}):SocialAccount=>({id,platform,providerAccountId:id+'-provider',displayName:id,status:'active',capabilities:{profileSync:{lastAttemptAt:new Date().toISOString(),lastSuccessAt:new Date().toISOString()}},createdAt:'2026-10-17T01:00:00Z',...overrides});
const accounts=[account('Brand Instagram','instagram',{profileUrl:'https://www.instagram.com/brand/'}),account('Factory Page','facebook',{accountType:'page',status:'permission_missing'}),account('TikTok Brand','tiktok',{credential:{scopes:['user.info.basic','user.info.stats','video.list'],updatedAt:'2026-10-17T01:00:00Z'}}),account('Retired','linkedin')];
const providers=[{platform:'instagram',platformParam:'instagram',displayName:'Instagram',configured:true},{platform:'facebook',platformParam:'facebook',displayName:'Facebook',configured:false}] as OAuthProviderStatus[];
const panel=(overrides:any={})=><SocialAccountManager accounts={accounts} providers={providers} workspaceId="w1" token="test-token" canManage loading={false} failed={false} onAdd={()=>{}} onDisconnect={async()=>{}} {...overrides}/>;

test('Facebook Page sync is separate from add and only enabled for configured manager access',async()=>{
 let started=0;const configured=providers.map(p=>({...p,configured:true}));
 await withFacebookUI(panel({providers:configured,onSyncFacebookPages:()=>{started++;}}),async({view,requests}:any)=>{const button=facebookButton(view,'同步公共主页');assert.ok(button);await act(async()=>button.props.onClick());assert.equal(started,1);assert.equal(requests.length,0);});
 await withFacebookUI(panel({providers:configured,canManage:false,onSyncFacebookPages:()=>{started++;}}),async({view}:any)=>assert.equal(facebookButton(view,'同步公共主页'),undefined));
});

test('platform picker explains each supported account type before any authorization',async()=>{
  const allProviders=['facebook','instagram','tiktok','youtube','pinterest','linkedin'].map(platform=>({platform,platformParam:platform,displayName:platform,configured:true}));
  await withFacebookUI(panel({providers:allProviders}),async({view,requests}:any)=>{
    await act(async()=>facebookButton(view,'添加账号').props.onClick());
    const picker=view.root.findByProps({role:'dialog'});
    for(const [platform,label] of [['facebook','公共主页（不支持个人账号）'],['instagram','专业账号：商业／创作者'],['tiktok','个人／企业账号'],['youtube','YouTube 频道'],['pinterest','企业账号']]){
      const button=picker.findAllByType('button').find((b:any)=>b.props.children.includes(platform));
      assert.ok(button);assert.ok(button.findAllByType('small').some((node:any)=>node.props.children===label));
    }
    assert.doesNotMatch(facebookText(view),/linkedin/);assert.equal(requests.length,0);
  });
});

test('platformAndSearchFiltersApplyTogetherAcrossCardsAndListWithoutRequests',async()=>withFacebookUI(panel(),async({view,requests}:any)=>{
  assert.doesNotMatch(facebookText(view),/Retired/);
  await act(async()=>view.root.findByProps({'aria-label':'Facebook (1)'}).props.onClick());
  assert.match(facebookText(view),/Factory Page/);assert.doesNotMatch(facebookText(view),/Brand Instagram/);
  await act(async()=>view.root.findByProps({'aria-label':'搜索账号'}).props.onChange({target:{value:' instagram '}}));
  assert.match(facebookText(view),/没有匹配的账号/);
  await act(async()=>facebookButton(view,'全部 (3)').props.onClick());
  assert.match(facebookText(view),/Brand Instagram/);assert.doesNotMatch(facebookText(view),/Factory Page/);
  await act(async()=>view.root.findByProps({'aria-label':'列表视图'}).props.onClick());
  assert.equal(view.root.findAllByType('table').length,1);assert.match(facebookText(view),/Brand Instagram/);
  assert.equal(requests.length,0);
}));

test('detailsKeepRealStateSafeProfileLinksAndManualStatisticsWithoutAutomaticAuthorization',async()=>withFacebookUI(panel(),async({view,requests}:any)=>{
  await act(async()=>view.root.findByProps({'aria-label':'查看 Factory Page 详情'}).props.onClick());
  const dialog=view.root.findByProps({role:'dialog'});assert.equal(dialog.props['aria-modal'],true);
  assert.match(facebookText(view),/权限不足|主页链接暂不可用/);
  assert.equal(view.root.findAllByType('a').filter((a:any)=>a.props.href==='javascript:bad').length,0);
  await act(async()=>facebookButton(view,'关闭详情').props.onClick());
  await act(async()=>view.root.findByProps({'aria-label':'查看 TikTok Brand 详情'}).props.onClick());
  assert.match(facebookText(view),/查看账号数据/);assert.doesNotMatch(facebookText(view),/补充数据授权/);
  assert.equal(requests.length,0);
}));

test('addAndDisconnectAreExplicitAndViewerHasNoMutationControls',async()=>{
  const added:string[]=[],removed:string[]=[];
  await withFacebookUI(panel({onAdd:(p:OAuthProviderStatus)=>added.push(p.platform),onDisconnect:async(id:string)=>{removed.push(id);}}),async({view}:any)=>{
    await act(async()=>facebookButton(view,'添加账号').props.onClick());assert.deepEqual(added,[]);
    const picker=view.root.findByProps({role:'dialog'});
    assert.equal(picker.findAllByType('button').find((b:any)=>b.props.children.includes('Facebook')).props.disabled,true);
    await act(async()=>picker.findAllByType('button').find((b:any)=>b.props.children.includes('Instagram')).props.onClick());assert.deepEqual(added,['instagram']);
    await act(async()=>view.root.findByProps({'aria-label':'查看 Brand Instagram 详情'}).props.onClick());
    assert.deepEqual(removed,[]);await act(async()=>facebookButton(view,'解除绑定').props.onClick());assert.deepEqual(removed,['Brand Instagram']);
  });
  await withFacebookUI(panel({canManage:false}),async({view}:any)=>{
    assert.equal(facebookButton(view,'添加账号'),undefined);
    await act(async()=>view.root.findByProps({'aria-label':'查看 Factory Page 详情'}).props.onClick());
    assert.equal(facebookButton(view,'解除绑定'),undefined);
  });
});

test('loadingFailureAndWorkspaceChangesDoNotLeakOldAccountsOrInventEmptyResults',async()=>withFacebookUI(panel(),async({view}:any)=>{
  await act(async()=>view.root.findByProps({'aria-label':'查看 Brand Instagram 详情'}).props.onClick());
  await act(async()=>view.update(<LanguageWrapper>{panel({workspaceId:'w2',accounts:[],loading:true})}</LanguageWrapper>));
  assert.doesNotMatch(facebookText(view),/Brand Instagram|暂无社交账号/);assert.equal(view.root.findAllByProps({role:'dialog'}).length,0);
  await act(async()=>view.update(<LanguageWrapper>{panel({workspaceId:'w2',accounts:[],loading:false,failed:true})}</LanguageWrapper>));
  assert.match(facebookText(view),/账号读取失败/);assert.doesNotMatch(facebookText(view),/暂无社交账号/);
}));
import {LanguageProvider as LanguageWrapper} from '../components/LanguageProvider';

async function withAccountPage(run:(f:any)=>Promise<void>,override:(url:URL,init?:RequestInit)=>Response|Promise<Response>|undefined,providerStatus=providers,platformAdmin=false){
  const previous={storage:(globalThis as any).localStorage,self:(globalThis as any).self};
  (globalThis as any).localStorage={getItem:(key:string)=>key==='social_scheduler_token'?'test-token':null,removeItem(){}};
  (globalThis as any).self={setTimeout:()=>1,clearTimeout(){}};
  const router={back(){},forward(){},refresh(){},push(){},replace(){},prefetch:async()=>{}};
  try{await withFacebookUI(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/social-accounts"><DashboardPageContent accountsOnly/></PathnameContext.Provider></AppRouterContext.Provider>,run,(url,init)=>{
    if(url.pathname.endsWith('/auth/me'))return Response.json({id:'user',name:'Owner',email:'owner@example.test',isPlatformAdmin:platformAdmin});
    if(url.pathname.endsWith('/workspaces'))return Response.json([{id:'w1',name:'First workspace',role:'owner'},{id:'w2',name:'Second workspace',role:'owner'}]);
    if(url.pathname.endsWith('/integrations/oauth/status'))return Response.json(providerStatus);
    return override(url,init);
  });}finally{(globalThis as any).localStorage=previous.storage;(globalThis as any).self=previous.self;}
}

test('ordinary owner sees no trial share import entry and never requests trial data',async()=>{
 await withAccountPage(async({view,requests}:any)=>{
  assert.ok(!facebookButton(view,'分享链接导入主页'),'ordinary owner must not see share import');
  assert.equal(requests.filter((r:any)=>r.path.includes('facebook-page-import-invitations')).length,0);
  await act(async()=>view.root.findByProps({'aria-label':'Facebook (0)'}).props.onClick());
  await act(async()=>facebookButton(view,'添加账号').props.onClick());
  assert.ok(!facebookButton(view,'创建导入邀请'));assert.ok(facebookButton(view,'立即连接'));assert.ok(facebookButton(view,'生成链接'));
 },url=>url.pathname.endsWith('/social-accounts')?Response.json([accounts[0]]):undefined,providers.map(p=>({...p,configured:true})));
});

test('platform administrator retains trial share import controls without starting OAuth',async()=>{
 await withAccountPage(async({view,requests}:any)=>{
  assert.ok(facebookButton(view,'分享链接导入主页'));assert.equal(requests.filter((r:any)=>r.path.includes('facebook-page-import-invitations')).length,1);
  await act(async()=>facebookButton(view,'分享链接导入主页').props.onClick());assert.ok(facebookButton(view,'确认生成链接'));
  assert.equal(requests.filter((r:any)=>r.method==='POST').length,0);
 },url=>url.pathname.endsWith('/social-accounts')?Response.json([accounts[0]]):url.pathname.endsWith('/facebook-page-import-invitations')?Response.json({items:[],nextCursor:null}):undefined,providers.map(p=>({...p,configured:true})),true);
});

test('real social account page opens a separate sync dialog without starting OAuth or changing bindings',async()=>{
 await withAccountPage(async({view,requests}:any)=>{
  await act(async()=>facebookButton(view,'同步公共主页').props.onClick());
  assert.match(facebookText(view),/仅导入新增主页/);assert.ok(facebookButton(view,'前往 Facebook 授权'));
  assert.equal(requests.filter((r:any)=>r.method==='POST'||r.method==='DELETE').length,0);
 },url=>url.pathname.endsWith('/social-accounts')?Response.json([accounts[0]]):undefined,providers.map(p=>({...p,configured:true})));
});

test('accountPageHidesChannelsButTopAddRetainsOfficialAndSharedAuthorization',async()=>{
  await withAccountPage(async({view,requests}:any)=>{
    assert.equal(view.root.findAllByProps({id:'social-channels'}).length,0);
    await act(async()=>facebookButton(view,'添加账号').props.onClick());
    const picker=view.root.findByProps({role:'dialog'});
    await act(async()=>picker.findAllByType('button').find((b:any)=>b.props.children.includes('Instagram')).props.onClick());
    assert.match(facebookText(view),/官方授权登录/);
    assert.match(facebookText(view),/支持绑定：.*专业账号：商业／创作者/);
    assert.match(facebookText(view),/实际可用功能以完成授权后的账号详情为准/);
    assert.equal(facebookButton(view,'立即连接').props.disabled,false);
    assert.equal(requests.filter((r:any)=>r.path.includes('/oauth/start')).length,0);
    await act(async()=>facebookButton(view,'生成链接').props.onClick());
    assert.ok(view.root.findAllByType('input').some((input:any)=>input.props.readOnly&&input.props.value==='https://example.test/shared-authorization'));
    const writes=requests.filter((r:any)=>r.method==='POST');
    assert.equal(writes.length,1);
    assert.equal(writes[0].path,'/api/v1/workspaces/w1/social-accounts/authorization-links');
    assert.deepEqual(writes[0].body,{platform:'instagram'});
  },(url,init)=>url.pathname.endsWith('/authorization-links')&&init?.method==='POST'?Response.json({shareUrl:'https://example.test/shared-authorization',expiresAt:'2026-10-18T00:00:00Z'}):url.pathname.endsWith('/social-accounts')?Response.json([accounts[0]]):undefined);
});

test('filtered add still explains account type in the authorization window without starting OAuth',async()=>{
  await withAccountPage(async({view,requests}:any)=>{
    await act(async()=>view.root.findByProps({'aria-label':'Instagram (1)'}).props.onClick());
    await act(async()=>facebookButton(view,'添加账号').props.onClick());
    assert.match(facebookText(view),/支持绑定：.*专业账号：商业／创作者/);
    assert.equal(requests.filter((r:any)=>r.path.includes('/oauth/start')||r.method==='POST').length,0);
  },url=>url.pathname.endsWith('/social-accounts')?Response.json([accounts[0]]):undefined);
});

test('realAccountPageConfirmsIdentityAndCancellationNeverDeletes',async()=>{
  let allowed=false,deleted=false;const confirmations:string[]=[];
  await withAccountPage(async({view,requests}:any)=>{
    (globalThis as any).window.confirm=(message:string)=>{confirmations.push(message);return allowed;};
    await act(async()=>view.root.findByProps({'aria-label':'查看 Brand Instagram 详情'}).props.onClick());
    await act(async()=>facebookButton(view,'解除绑定').props.onClick());
    assert.equal(requests.filter((r:any)=>r.method==='DELETE').length,0);assert.equal(deleted,false);
    assert.match(confirmations[0],/Brand Instagram/);assert.match(confirmations[0],/Instagram/);
    allowed=true;await act(async()=>facebookButton(view,'解除绑定').props.onClick());
    assert.equal(requests.filter((r:any)=>r.method==='DELETE').length,1);
    assert.equal(view.root.findAllByProps({role:'dialog'}).length,0);
  },(url,init)=>{
    if(decodeURIComponent(url.pathname).endsWith('/social-accounts/Brand Instagram')&&init?.method==='DELETE'){deleted=true;return Response.json({disconnected:true});}
    if(url.pathname.endsWith('/social-accounts'))return Response.json(deleted?[]:[accounts[0]]);
  });
});

test('lateWorkspaceAccountResponseCannotReplaceCurrentWorkspaceOrReopenDetails',async()=>{
  let resolve!:(response:Response)=>void;
  await withAccountPage(async({view}:any)=>{
    const selector=view.root.findAllByType('select')[0];
    await act(async()=>selector.props.onChange({target:{value:'w2'}}));
    assert.match(facebookText(view),/New Workspace Account/);
    await act(async()=>resolve(Response.json([account('Old Workspace Account','instagram')])));
    assert.match(facebookText(view),/New Workspace Account/);assert.doesNotMatch(facebookText(view),/Old Workspace Account/);
  },url=>url.pathname.endsWith('/workspaces/w1/social-accounts')?new Promise<Response>(r=>{resolve=r;}):url.pathname.endsWith('/workspaces/w2/social-accounts')?Response.json([account('New Workspace Account','instagram')]):undefined);
});

test('disconnectCompletingAfterWorkspaceSwitchCannotInvalidateNewWorkspaceRead',async()=>{
  let finishDelete!:(response:Response)=>void,finishSecondRead!:(response:Response)=>void;
  await withAccountPage(async({view,requests}:any)=>{
    (globalThis as any).window.confirm=()=>true;
    await act(async()=>view.root.findByProps({'aria-label':'查看 Brand Instagram 详情'}).props.onClick());
    await act(async()=>{void facebookButton(view,'解除绑定').props.onClick();});
    await act(async()=>view.root.findAllByType('select')[0].props.onChange({target:{value:'w2'}}));
    await act(async()=>finishDelete(Response.json({disconnected:true})));
    await act(async()=>finishSecondRead(Response.json([account('New Workspace Account','instagram')])));
    assert.match(facebookText(view),/New Workspace Account/);
    assert.equal(requests.filter((r:any)=>r.path.endsWith('/workspaces/w1/social-accounts')).length,1);
  },(url,init)=>init?.method==='DELETE'?new Promise<Response>(r=>{finishDelete=r;}):url.pathname.endsWith('/workspaces/w1/social-accounts')?Response.json([accounts[0]]):url.pathname.endsWith('/workspaces/w2/social-accounts')?new Promise<Response>(r=>{finishSecondRead=r;}):undefined);
});

test('manual profile response updates name and image without reloading grants or changing account identity',async()=>{
  await withAccountPage(async({view,requests}:any)=>{
    await act(async()=>view.root.findByProps({'aria-label':'查看 Brand Instagram 详情'}).props.onClick());
    await act(async()=>facebookButton(view,'刷新账号资料').props.onClick());
    assert.match(facebookText(view),/Renamed Brand/);
    assert.ok(view.root.findAllByType('img').some((img:any)=>img.props.src==='https://example.test/new-avatar.jpg'));
    const writes=requests.filter((r:any)=>r.method!=='GET');assert.equal(writes.length,1);
    assert.match(decodeURIComponent(writes[0].path),/social-accounts\/Brand Instagram\/refresh-profile$/);assert.deepEqual(writes[0].body,{mode:'manual'});
    assert.doesNotMatch(facebookText(view),/Brand Instagram-provider/);
  },(url,init)=>url.pathname.endsWith('/refresh-profile')&&init?.method==='POST'?Response.json({status:'updated',id:'Brand Instagram',displayName:'Renamed Brand',avatarUrl:'https://example.test/new-avatar.jpg',profileUrl:'https://www.instagram.com/new_brand/',profileSync:{lastAttemptAt:new Date().toISOString(),lastSuccessAt:new Date().toISOString()}}):url.pathname.endsWith('/social-accounts')?Response.json([accounts[0]]):undefined);
});

test('late automatic profile response cannot leak the old workspace name or avatar into the new one',async()=>{
  let finish!:(response:Response)=>void;
  await withAccountPage(async({view,requests}:any)=>{
    assert.equal(requests.filter((r:any)=>r.path.endsWith('/refresh-profile')).length,1);
    await act(async()=>view.root.findAllByType('select')[0].props.onChange({target:{value:'w2'}}));
    await act(async()=>finish(Response.json({status:'updated',id:'Brand Instagram',displayName:'Wrong workspace name',avatarUrl:'https://example.test/wrong-avatar.jpg',profileSync:{lastAttemptAt:new Date().toISOString(),lastSuccessAt:new Date().toISOString()}})));
    assert.match(facebookText(view),/New Workspace Account/);assert.doesNotMatch(facebookText(view),/Wrong workspace name|wrong-avatar/);
  },(url,init)=>url.pathname.endsWith('/refresh-profile')&&init?.method==='POST'?new Promise<Response>(r=>{finish=r;}):url.pathname.endsWith('/workspaces/w1/social-accounts')?Response.json([{...accounts[0],capabilities:{}}]):url.pathname.endsWith('/workspaces/w2/social-accounts')?Response.json([account('New Workspace Account','instagram')]):undefined);
});
