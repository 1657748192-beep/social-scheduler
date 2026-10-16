import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {PostPreview} from '../components/composer/PostPreview';
import {LanguageProvider} from '../components/LanguageProvider';

const platforms=['instagram','facebook','youtube','tiktok','pinterest'] as const;
function visibleText(node:any):string{return typeof node==='string'?node:(node.children??[]).map(visibleText).join('');}
function props(platform:string='instagram'):any{
 const maps=(value:any)=>Object.fromEntries(platforms.map(p=>[p,value]));
 return {accounts:[{id:'a',platform,displayName:'First account',capabilities:{},status:'active'}],texts:maps('Hello #护肤 #SkinCare_2026，＃新品\nhttps://example.test/#fragment C#code'),websites:maps(''),baseText:'base',mediaByPlatform:maps([{id:'m1',mimeType:'image/jpeg',fileUrl:'/one.jpg',originalAvailable:true},{id:'m2',mimeType:'image/jpeg',fileUrl:'/two.jpg',originalAvailable:true}]),mediaSources:maps('shared'),pinterestSettingsByAccount:{},loading:false};
}
async function fixture(t:any,p=props(),english=false){
 const previous=new Map<string,PropertyDescriptor|undefined>();let view:ReactTestRenderer;
 for(const [key,value] of Object.entries({React,IS_REACT_ACT_ENVIRONMENT:true,window:{localStorage:{getItem:()=>english?'en':null,setItem(){}}},document:{documentElement:{lang:''}}})){
  previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 }
 await act(async()=>{view=create(<LanguageProvider><PostPreview {...p}/></LanguageProvider>);});
 t.after(async()=>{await act(async()=>view.unmount());for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete(globalThis as any)[k];}});
 const button=(name:string)=>view.root.findAllByType('button').find(b=>b.props['aria-label']===name||b.children.includes(name))!;
 await act(async()=>button(english?'Preview':'预览效果').props.onClick());
 return {view:()=>view,button,dialog:()=>view.root.findByProps({role:'dialog'}),click:async(name:string)=>{assert.ok(button(name),`missing button ${name}`);await act(async()=>button(name).props.onClick());}};
}

test('preview highlights Unicode hashtags without coloring URL fragments or changing the publishing text',async t=>{
 const p=props(),before=JSON.stringify(p),f=await fixture(t,p);
 const tags=f.dialog().findAll(n=>n.props.className==='preview-hashtag').map(n=>n.children.join(''));
 assert.deepEqual(tags,['#护肤','#SkinCare_2026','＃新品']);
 assert.ok(visibleText(f.dialog()).includes('https://example.test/#fragment'));
 assert.equal(JSON.stringify(p),before);
});

test('only accepted adjacent hashtags inherit a boundary; word-internal and non-BMP-letter suffixes remain plain',async t=>{
 const p=props();p.texts.instagram='C#code#tail 𐐀#hidden #one#two #中文';const f=await fixture(t,p);
 assert.deepEqual(f.dialog().findAll(n=>n.props.className==='preview-hashtag').map(n=>visibleText(n)),['#one','#two','#中文']);
});

for(const platform of platforms)test(`${platform} preview uses its own post layout and never invents engagement counts`,async t=>{
 const f=await fixture(t,props(platform));
 const card=f.dialog().find(n=>n.type==='article'&&n.props['data-platform']===platform);
 assert.equal(card.props['data-layout'],platform==='tiktok'?'video-overlay':platform==='pinterest'?'pin':platform==='youtube'?'watch':'feed');
 const slots=card.findAll(n=>!!n.props['data-preview-slot']).map(n=>n.props['data-preview-slot']);
 if(platform==='facebook')assert.ok(slots.indexOf('caption')<slots.indexOf('media'));
 else assert.ok(slots.indexOf('media')<slots.indexOf('caption'));
 assert.doesNotMatch(visibleText(card),/1,234|999|10K/);
});

test('carousel moves through real media and resets on reopening the preview',async t=>{
 const f=await fixture(t);assert.equal(f.dialog().findByProps({'data-preview-slot':'media'}).findByType('img').props.src,'/one.jpg');
 await f.click('下一张');assert.equal(f.dialog().findByProps({'data-preview-slot':'media'}).findByType('img').props.src,'/two.jpg');
 await f.click('关闭预览');await f.click('预览效果');assert.equal(f.dialog().findByProps({'data-preview-slot':'media'}).findByType('img').props.src,'/one.jpg');
});

test('account switching shows that Pinterest account title and destination without changing its draft',async t=>{
 const p=props('pinterest');p.accounts.push({...p.accounts[0],id:'b',displayName:'Second account'});p.pinterestSettingsByAccount={a:{title:'First Pin'},b:{title:'Second Pin'}};p.websites.pinterest='https://shop.test/item';
 const before=JSON.stringify(p),f=await fixture(t,p);const select=f.dialog().findByProps({'aria-label':'预览账号'});
 await act(async()=>select.props.onChange({target:{value:'b'}}));
 const text=JSON.stringify(f.view().toJSON());assert.match(text,/Second Pin/);assert.doesNotMatch(text,/First Pin/);assert.match(text,/https:\/\/shop.test\/item/);assert.equal(JSON.stringify(p),before);
});

test('long copy expands on demand and video playback is not autoplayed',async t=>{
 const p=props('tiktok');p.texts.tiktok='长文案'.repeat(150)+' #末尾';p.mediaByPlatform.tiktok=[{id:'v',mimeType:'video/mp4',fileUrl:'/original.mp4',thumbnailUrl:'/cover.jpg',originalAvailable:true}];
 const f=await fixture(t,p,true);assert.doesNotMatch(visibleText(f.dialog()),/#末尾/);
 await f.click('Show more');assert.match(visibleText(f.dialog()),/#末尾/);
 const video=f.dialog().findByType('video');assert.notEqual(video.props.autoPlay,true);assert.equal(video.props.preload,'none');
});

test('expired media never attempts playback and Escape closes the simulated preview',async t=>{
 const p=props('youtube');p.mediaByPlatform.youtube=[{id:'v',mimeType:'video/mp4',fileUrl:'/expired.mp4',originalAvailable:false}];const f=await fixture(t,p);
 assert.equal(f.dialog().findAllByType('video').length,0);assert.equal(f.dialog().findAll(n=>n.props.src==='/expired.mp4').length,0);
 await act(async()=>f.dialog().props.onKeyDown({key:'Escape',stopPropagation(){}}));
 assert.equal(f.view().root.findAllByProps({role:'dialog'}).length,0);
});
