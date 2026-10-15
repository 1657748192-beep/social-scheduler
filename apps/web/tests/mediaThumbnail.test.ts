import assert from 'node:assert/strict';
import test from 'node:test';

function browser(t:any,mode:'never'|'sync'){
 const before=Object.getOwnPropertyDescriptor(globalThis,'document');let revoked=0;
 const video:any={videoWidth:16,videoHeight:16,duration:1,pause(){},load(){},removeAttribute(){},onloadeddata:null,onseeked:null,onerror:null};
 Object.defineProperty(video,'src',{set(){if(mode==='sync')video.onloadeddata?.();}});
 Object.defineProperty(video,'currentTime',{set(){if(mode==='sync')video.onseeked?.();}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:(tag:string)=>tag==='video'?video:{getContext:()=>({fillRect(){},drawImage(){}}),toBlob:(done:any)=>done(new Blob([new Uint8Array([255,216,255,224,1,255,217])],{type:'image/jpeg'}))}}});
 t.mock.method(URL,'createObjectURL',()=> 'blob:test-video');t.mock.method(URL,'revokeObjectURL',()=>{revoked++;});
 t.after(()=>{if(before)Object.defineProperty(globalThis,'document',before);else delete(globalThis as any).document;});
 return {video,revoked:()=>revoked};
}

test('a video whose events never arrive resolves null at five seconds and releases browser resources',async t=>{
 const f=browser(t,'never'),{createMediaThumbnail}=await import('../lib/mediaThumbnail');
 t.mock.timers.enable({apis:['setTimeout']});let settled=false;
 const result=createMediaThumbnail(new File(['v'],'v.mp4'),'video',{timeoutMs:5000,signal:new AbortController().signal}).then(v=>{settled=true;return v;});
 t.mock.timers.tick(4999);await Promise.resolve();assert.equal(settled,false);
 t.mock.timers.tick(1);assert.equal(await result,null);assert.equal(f.revoked(),1);assert.equal(f.video.onloadeddata,null);assert.equal(f.video.onerror,null);
});

test('synchronously fired video load and seek events are not missed',async t=>{
 const f=browser(t,'sync'),{createMediaThumbnail}=await import('../lib/mediaThumbnail');
 const result=await createMediaThumbnail(new File(['v'],'v.mp4'),'video',{timeoutMs:100,signal:new AbortController().signal});
 assert.equal(result?.type,'image/jpeg');assert.ok(result!.size<=102400);assert.equal(f.revoked(),1);assert.equal(f.video.onseeked,null);
});

test('aborting thumbnail generation does not wait for a video event',async t=>{
 const f=browser(t,'never'),{createMediaThumbnail}=await import('../lib/mediaThumbnail'),controller=new AbortController();
 const result=createMediaThumbnail(new File(['v'],'v.mp4'),'video',{timeoutMs:5000,signal:controller.signal});
 controller.abort();assert.equal(await result,null);assert.equal(f.revoked(),1);assert.equal(f.video.onloadeddata,null);
});
