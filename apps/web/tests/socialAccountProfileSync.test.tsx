import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {act} from 'react-test-renderer';
import {SocialAccountManager} from '../components/social/SocialAccountManager';
import {LanguageProvider} from '../components/LanguageProvider';
import {withFacebookUI,facebookButton,facebookText} from './helpers/facebookManagementUI';

const fresh=new Date().toISOString(),old='2026-01-01T00:00:00Z';
const a=(id:string,extra:any={})=>({id,platform:'youtube',providerAccountId:'UCabcdefghijklmnopqrstuv',displayName:id,avatarUrl:'https://yt3.ggpht.com/old.jpg',status:'active',createdAt:old,capabilities:{profileSync:{lastAttemptAt:fresh,lastSuccessAt:fresh}},...extra});
const panel=(props:any={})=><SocialAccountManager accounts={[a('Old name')]} providers={[]} workspaceId="w1" token="test-token" canManage loading={false} failed={false} onAdd={()=>{}} onDisconnect={async()=>{}} {...props}/>;

test('manual profile refresh is explicit, pending disables duplicate clicks, and failed refresh keeps the existing image',async()=>{
  let reject!:(e:Error)=>void;const calls:any[]=[];
  await withFacebookUI(panel({onRefresh:(id:string,mode:string)=>{calls.push([id,mode]);return new Promise((_resolve,r)=>{reject=r;});}}),async({view}:any)=>{
    assert.deepEqual(calls,[]);
    await act(async()=>view.root.findByProps({'aria-label':'查看 Old name 详情'}).props.onClick());
    await act(async()=>{void facebookButton(view,'刷新账号资料').props.onClick();});
    assert.equal(facebookButton(view,'正在同步…').props.disabled,true);
    await act(async()=>{void facebookButton(view,'正在同步…').props.onClick();});
    assert.deepEqual(calls,[['Old name','manual']]);
    await act(async()=>reject(Error('Provider failed')));
    assert.match(facebookText(view),/同步失败/);assert.ok(view.root.findAllByType('img').some((img:any)=>img.props.src==='https://yt3.ggpht.com/old.jpg'));
  });
});

test('automatic sync selects only stale active accounts, runs two at a time and never retries a failure on rerender',async()=>{
  const list=[a('stale1',{capabilities:{}}),a('stale2',{capabilities:{profileSync:{lastAttemptAt:old}}}),a('stale3',{capabilities:{}}),a('fresh'),a('disconnected',{status:'disconnected',capabilities:{}}),a('retired',{platform:'linkedin',capabilities:{}})];
  const calls:any[]=[],finish:Array<(value:any)=>void>=[];
  const onRefresh=(id:string,mode:string)=>{calls.push([id,mode]);return new Promise(r=>finish.push(r));};
  await withFacebookUI(panel({accounts:list,onRefresh}),async({view}:any)=>{
    assert.deepEqual(calls,[['stale1','auto'],['stale2','auto']]);
    await act(async()=>finish[0]({status:'updated'}));
    assert.deepEqual(calls,[['stale1','auto'],['stale2','auto'],['stale3','auto']]);
    await act(async()=>{finish[1](null);finish[2](null);});
    await act(async()=>view.update(<LanguageProvider>{panel({accounts:[...list],onRefresh})}</LanguageProvider>));
    assert.equal(calls.length,3);assert.doesNotMatch(facebookText(view),/同步失败/);
  });
});

test('viewer, loading and failed pages never auto-sync; leaving the page stops queued work',async()=>{
  for(const flags of [{canManage:false},{loading:true},{failed:true}]){
    const calls:any[]=[];
    await withFacebookUI(panel({accounts:[a('stale',{capabilities:{}})],onRefresh:()=>calls.push('unexpected'),...flags}),async({view}:any)=>{
      assert.deepEqual(calls,[]);
      if(flags.canManage===false){await act(async()=>view.root.findByProps({'aria-label':'查看 stale 详情'}).props.onClick());assert.equal(facebookButton(view,'刷新账号资料'),undefined);}
    });
  }
  const calls:any[]=[],finish:Array<(v:any)=>void>=[];
  await withFacebookUI(panel({accounts:['a','b','c'].map(id=>a(id,{capabilities:{}})),onRefresh:(id:string)=>{calls.push(id);return new Promise(r=>finish.push(r));}}),async({unmount}:any)=>{
    assert.equal(calls.length,2);await unmount();await act(async()=>{finish.forEach(r=>r(null));});assert.equal(calls.length,2);
  });
});

test('provider default letter images remain images, unsafe/broken avatars fall back neutrally and a new URL recovers',async()=>{
  await withFacebookUI(panel(),async({view}:any)=>{
    const img=view.root.findAllByType('img').find((el:any)=>el.props.src==='https://yt3.ggpht.com/old.jpg');assert.ok(img);
    await act(async()=>img.props.onError());
    assert.equal(view.root.findAllByType('img').some((el:any)=>el.props.src==='https://yt3.ggpht.com/old.jpg'),false);
    assert.ok(view.root.findAllByProps({'data-avatar-fallback':true}).length);
    await act(async()=>view.update(<LanguageProvider>{panel({accounts:[a('Old name',{avatarUrl:'https://yt3.ggpht.com/new.jpg'})]})}</LanguageProvider>));
    assert.ok(view.root.findAllByType('img').some((el:any)=>el.props.src==='https://yt3.ggpht.com/new.jpg'));
    await act(async()=>view.update(<LanguageProvider>{panel({accounts:[a('Old name',{avatarUrl:'javascript:alert(1)'})]})}</LanguageProvider>));
    assert.equal(view.root.findAllByType('img').some((el:any)=>el.props.src==='javascript:alert(1)'),false);
  });
});

test('successful profile synchronization retries the same avatar URL after a transient browser image failure',async()=>{
  await withFacebookUI(panel(),async({view}:any)=>{
    const img=view.root.findAllByType('img').find((el:any)=>el.props.src==='https://yt3.ggpht.com/old.jpg');
    await act(async()=>img.props.onError());
    assert.equal(view.root.findAllByType('img').some((el:any)=>el.props.src==='https://yt3.ggpht.com/old.jpg'),false);
    await act(async()=>view.update(<LanguageProvider>{panel({accounts:[a('Old name',{capabilities:{profileSync:{lastAttemptAt:fresh,lastSuccessAt:'2027-01-01T00:00:00Z'}}})]})}</LanguageProvider>));
    assert.ok(view.root.findAllByType('img').some((el:any)=>el.props.src==='https://yt3.ggpht.com/old.jpg'));
  });
});
