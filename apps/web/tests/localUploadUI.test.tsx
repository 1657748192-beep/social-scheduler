import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {randomUUID} from 'node:crypto';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {MediaUploader} from '../components/composer/MediaUploader';
import {LanguageProvider} from '../components/LanguageProvider';
import {createUploadHttpFixture} from './helpers/localUploadHttpTransport';

async function fixture(t:any,english=false,storageFails=false){
 let view:ReactTestRenderer|undefined;const before=new Map<string,PropertyDescriptor|undefined>();
 const globals=(name:string,value:any)=>{before.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});};
 t.after(async()=>{if(view)await act(async()=>view!.unmount());for(const [key,descriptor]of before){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete(globalThis as any)[key];}});
 const f=await createUploadHttpFixture(t);if(english)f.storage.set('social_scheduler_locale','en');
 if(storageFails)localStorage.setItem=()=>{throw new Error('browser storage quota exceeded');};
 globals('React',React);globals('IS_REACT_ACT_ENVIRONMENT',true);
 globals('window',{localStorage,location:{pathname:'/composer',assign(){}}});
 let neverVideo=false;
 const image=()=>{const img:any={naturalWidth:16,naturalHeight:16,onload:null,onerror:null,removeAttribute(){}};Object.defineProperty(img,'src',{set(){queueMicrotask(()=>img.onload?.());}});return img;};
 globals('Image',class{constructor(){return image();}});
 globals('document',{documentElement:{lang:''},createElement:(tag:string)=>{
  if(tag==='canvas')return {getContext:()=>({fillRect(){},drawImage(){}}),toBlob:(done:any)=>done(new Blob([new Uint8Array([255,216,255,224,1,255,217])],{type:'image/jpeg'}))};
  const video:any={videoWidth:16,videoHeight:16,duration:1,onloadeddata:null,onseeked:null,onerror:null,pause(){},removeAttribute(){},load(){}};
  Object.defineProperty(video,'src',{set(){if(!neverVideo)queueMicrotask(()=>video.onloadeddata?.());}});Object.defineProperty(video,'currentTime',{set(){queueMicrotask(()=>video.onseeked?.());}});return video;
 }});
 globals('fetch',async()=>Response.json({message:'COS direct upload is not enabled on this server'},{status:409}));
 const changed:any[]=[];let props={workspaceId:randomUUID(),token:'ui-token',media:[],label:'TikTok',description:'Original media',onMediaChange:(value:any)=>changed.push(value)};
 const render=()=>React.createElement(LanguageProvider,null,React.createElement(MediaUploader,props));
 await act(async()=>{view=create(render());});
 const choose=async(file:File)=>{await act(async()=>{void view!.root.findAllByType('input').find(node=>node.props.accept===(file.type.startsWith('image/')?'image/*':'video/*'))!.props.onChange({target:{files:[file],value:'selected'}});});};
 const until=async(predicate:()=>boolean)=>{const end=Date.now()+2500;while(!predicate()){if(Date.now()>end)assert.fail('UI did not reach expected state');await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});}};
 return {...f,choose,changed,until,text:()=>JSON.stringify(view!.toJSON()),view:()=>view!,neverVideo:()=>{neverVideo=true;},switchScope:async()=>{props={...props,workspaceId:'33333333-3333-4333-8333-333333333333',token:'another-token'};await act(async()=>view!.update(render()));}};
}

test('8MiB videos use chunks and show finalizing until the asset is actually confirmed',async t=>{
 const f=await fixture(t);f.controls.holdComplete=true;
 await f.choose(new File([Buffer.alloc(8388608)],'large.mp4',{type:'video/mp4'}));
 await f.until(()=>f.text().includes('合并确认'));
 assert.equal(f.controls.legacyPuts,0);assert.equal(f.controls.puts,8);assert.equal(f.changed.length,0);assert.doesNotMatch(f.text(),/100%/);
 await act(async()=>f.releaseCompletes());await f.until(()=>f.changed.length===1);
});

test('small video and images retain ordinary upload behavior',async t=>{
 const f=await fixture(t);
 await f.choose(new File([Buffer.alloc(8388607)],'small.mp4',{type:'video/mp4'}));await f.until(()=>f.changed.length===1);
 await f.choose(new File([Buffer.alloc(8388608)],'large.jpg',{type:'image/jpeg'}));await f.until(()=>f.changed.length===2);
 assert.equal(f.controls.legacyPuts,2);assert.equal(f.controls.puts,0);
});

test('capability 404 falls back before init, but 503 and post-init failures never send the whole file',async t=>{
 const f=await fixture(t);f.controls.capStatus=503;
 await f.choose(new File([Buffer.alloc(8388608)],'cap.mp4',{type:'video/mp4'}));await f.until(()=>f.text().includes('重试'));
 assert.equal(f.controls.legacyPuts,0);assert.equal(f.sessions.size,0);
 f.controls.capStatus=404;
 await act(async()=>{void f.view().root.findAllByType('button').find(n=>n.children.includes('重试'))!.props.onClick();});await f.until(()=>f.changed.length===1);
 assert.equal(f.controls.legacyPuts,1);assert.equal(f.sessions.size,0);
});

test('chunk failures keep retry and cancel controls and English refresh-resume guidance',async t=>{
 const f=await fixture(t,true);f.controls.status=403;
 await f.choose(new File([Buffer.alloc(8388608)],'forbidden.mp4',{type:'video/mp4'}));await f.until(()=>f.text().includes('Retry'));
 assert.equal(f.controls.legacyPuts,0);assert.match(f.text(),/Cancel/);assert.match(f.text(),/select the same file/i);
 assert.equal([...f.sessions.values()][0].attempts.get(0),1);
 await act(async()=>{void f.view().root.findAllByType('button').find(n=>n.children.includes('Cancel'))!.props.onClick();});
 await f.until(()=>f.controls.cancels===1&&[...f.storage.keys()].filter(key=>key.startsWith('local-upload:')).length===0);
});

test('unwritable browser storage leaves this-page uploads usable and displays the refresh warning',async t=>{
 const f=await fixture(t,false,true);f.controls.holdComplete=true;
 await f.choose(new File([Buffer.alloc(8388608)],'storage.mp4',{type:'video/mp4'}));
 await f.until(()=>f.text().includes('刷新后不能保证续传'));
 await act(async()=>f.releaseCompletes());await f.until(()=>f.changed.length===1);
});

test('a never-ready thumbnail does not block video transmission and changing workspace cancels old requests',async t=>{
 const f=await fixture(t);f.neverVideo();
 await f.choose(new File([Buffer.alloc(8388608)],'never-ready.mp4',{type:'video/mp4'}));await f.until(()=>f.controls.puts>0);
 assert.equal(f.changed.length,0);await f.switchScope();
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});assert.equal(f.changed.length,0);assert.doesNotMatch(f.text(),/never-ready.mp4/);
});

test('a capability 401 is not hidden by a whole-file fallback',async t=>{
 const f=await fixture(t);f.controls.capStatus=401;
 await f.choose(new File([Buffer.alloc(8388608)],'login.mp4',{type:'video/mp4'}));await f.until(()=>f.text().includes('登录已过期'));
 assert.equal(f.controls.legacyPuts,0);assert.equal(f.sessions.size,0);
});

test('rate-limit UI disables early retry and the handler also refuses a forced early click',async t=>{
 const f=await fixture(t);f.controls.status=429;f.controls.retryAfter='120';
 await f.choose(new File([Buffer.alloc(8388608)],'limited.mp4',{type:'video/mp4'}));await f.until(()=>f.text().includes('可重试时间'));
 const retry=f.view().root.findAllByType('button').find(n=>n.children.includes('重试'))!;assert.equal(retry.props.disabled,true);
 const puts=f.controls.puts;await act(async()=>{await retry.props.onClick();});assert.equal(f.controls.puts,puts);
});

test('a late cancel response reports that completed media was not deleted',async t=>{
 const f=await fixture(t);f.controls.status=403;
 await f.choose(new File([Buffer.alloc(8388608)],'late.mp4',{type:'video/mp4'}));await f.until(()=>f.text().includes('重试'));
 [...f.sessions.values()][0].state='completed';
 await act(async()=>{void f.view().root.findAllByType('button').find(n=>n.children.includes('取消'))!.props.onClick();});
 await f.until(()=>f.text().includes('素材未删除'));
});
