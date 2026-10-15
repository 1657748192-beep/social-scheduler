import {API_BASE_URL,UploadHttpError,parseRetryAfter,redirectToLoginAfterSessionExpiry} from './api';
export {UploadHttpError} from './api';
export function localUploadRequest<T>(path:string,token:string,options:{method:string;body?:unknown;bytes?:Blob;timeoutMs:number;signal:AbortSignal;onProgress?:(bytes:number)=>void}):Promise<T>{
 return new Promise((resolve,reject)=>{
  options.signal.throwIfAborted();const xhr=new XMLHttpRequest();let settled=false;
  const finish=(error?:unknown,value?:T)=>{if(settled)return;settled=true;options.signal.removeEventListener('abort',abort);xhr.onload=xhr.onerror=xhr.onabort=xhr.ontimeout=null;xhr.upload.onprogress=null;error?reject(error):resolve(value!);};
  const abort=()=>{xhr.abort();finish(new DOMException('Upload cancelled','AbortError'));};
  xhr.open(options.method,`${API_BASE_URL}${path}`);xhr.timeout=options.timeoutMs;xhr.setRequestHeader('Authorization',`Bearer ${token}`);
  if(options.bytes)xhr.setRequestHeader('Content-Type','application/octet-stream');else if(options.body!==undefined)xhr.setRequestHeader('Content-Type','application/json');
  xhr.upload.onprogress=event=>{if(event.lengthComputable)options.onProgress?.(event.loaded);};
  xhr.onload=()=>{
   let payload:any=null;try{payload=JSON.parse(xhr.responseText||'null');}catch{}
   if(xhr.status>=200&&xhr.status<300){finish(undefined,payload);return;}
   if(xhr.status===401)redirectToLoginAfterSessionExpiry();
   finish(new UploadHttpError(payload?.message??`Upload failed (HTTP ${xhr.status})`,xhr.status,payload?.details?.code,parseRetryAfter(xhr.getResponseHeader('Retry-After'))));
  };
  xhr.onerror=()=>finish(new UploadHttpError('Network connection interrupted',0));
  xhr.ontimeout=()=>finish(new UploadHttpError('Upload timed out; please retry',408));
  xhr.onabort=()=>finish(new DOMException('Upload cancelled','AbortError'));
  options.signal.addEventListener('abort',abort,{once:true});
  try{xhr.send(options.bytes??(options.body===undefined?null:JSON.stringify(options.body)));}catch(e){finish(e);}
 });
}
