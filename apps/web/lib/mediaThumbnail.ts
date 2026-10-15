/** Optional cover only. Original media is never read into a whole-file buffer. */
export function createMediaThumbnail(file:File,type:'image'|'video',options:{timeoutMs:number;signal:AbortSignal}):Promise<Blob|null>{
 return new Promise(resolve=>{
  let settled=false,url:string|undefined,video:HTMLVideoElement|undefined,image:HTMLImageElement|undefined;
  const finish=(value:Blob|null)=>{
   if(settled)return;settled=true;clearTimeout(timer);options.signal.removeEventListener('abort',abort);
   if(video){video.onloadeddata=video.onseeked=video.onerror=null;video.pause();video.removeAttribute('src');video.load();}
   if(image){image.onload=image.onerror=null;image.removeAttribute('src');}
   if(url)URL.revokeObjectURL(url);resolve(value);
  };
  const abort=()=>finish(null),timer=setTimeout(()=>finish(null),Math.min(5000,Math.max(1,options.timeoutMs)));
  options.signal.addEventListener('abort',abort,{once:true});if(options.signal.aborted){finish(null);return;}
  async function capture(source:CanvasImageSource,width:number,height:number){
   if(!width||!height){finish(null);return;}
   try{
    for(const [maxDimension,quality] of [[320,.72],[280,.62],[240,.52],[200,.42]]){
     if(settled)return;const canvas=document.createElement('canvas'),scale=Math.min(1,maxDimension/Math.max(width,height));
     canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
     const context=canvas.getContext('2d');if(!context){finish(null);return;}
     context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,canvas.width,canvas.height);
     const blob=await new Promise<Blob|null>(done=>canvas.toBlob(done,'image/jpeg',quality));
     if(blob&&blob.size<=80*1024){finish(blob);return;}
    }
    finish(null);
   }catch{finish(null);}
  }
  try{
   url=URL.createObjectURL(file);
   if(type==='video'){
    video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='metadata';
    const draw=()=>{if(!settled)void capture(video!,video!.videoWidth,video!.videoHeight);};
    video.onerror=()=>finish(null);
    video.onloadeddata=()=>{
     video!.onloadeddata=null;
     if(Number.isFinite(video!.duration)&&video!.duration>.1){const time=Math.min(.1,video!.duration/2);if(video!.currentTime===time){draw();return;}video!.onseeked=draw;video!.currentTime=time;}
     else draw();
    };
    video.src=url;
   }else{
    image=new Image();image.decoding='async';image.onload=()=>void capture(image!,image!.naturalWidth,image!.naturalHeight);image.onerror=()=>finish(null);image.src=url;
   }
  }catch{finish(null);}
 });
}
