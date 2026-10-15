type Waiting={start:()=>void;signal:AbortSignal;abort:()=>void};
let active=0;const waiting:Waiting[]=[];
function drain(){while(active<2&&waiting.length){const item=waiting.shift()!;item.signal.removeEventListener('abort',item.abort);if(!item.signal.aborted)item.start();}}
export const localUploadQueue={run<T>(task:()=>Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Upload cancelled','AbortError'));return;}
  const item:Waiting={signal,abort:()=>{const i=waiting.indexOf(item);if(i>=0)waiting.splice(i,1);reject(new DOMException('Upload cancelled','AbortError'));},start:()=>{
   active++;Promise.resolve().then(task).then(resolve,reject).finally(()=>{active--;drain();});
  }};
  signal.addEventListener('abort',item.abort,{once:true});waiting.push(item);drain();
 });
}};
