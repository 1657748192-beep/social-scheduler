import {HttpError} from '../utils/errors';
/** Shared only by fixed-host callers. Never includes provider bodies/URLs in failures. */
export async function readBoundedInstagramJson(fetchImpl:typeof fetch,url:URL,options:RequestInit={},preserveLargeIdentifiers=false){
 const response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok||!response.body)throw new HttpError(502,'Independent Instagram request unavailable');
 if(Number(response.headers.get('content-length')??0)>1048576){await response.body.cancel();throw new HttpError(502,'Independent Instagram response exceeds limit');}
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1048576){await reader.cancel();throw new HttpError(502,'Independent Instagram response exceeds limit');}parts.push(part.value);}}finally{reader.releaseLock();}
 const text=Buffer.concat(parts).toString('utf8');
 if(!preserveLargeIdentifiers)return JSON.parse(text) as unknown;
 // Node22 supplies the original primitive lexeme. Never stringify an already
 // rounded Number; only exact unsigned decimal ID bytes may become a string.
 // Opt-in is restricted to OAuth/identity responses, not general Graph DTOs.
 return JSON.parse(text,(key:string,value:unknown,context?:{source?:string})=>{
  if((key==='id'||key==='user_id')&&typeof value==='number'&&!Number.isSafeInteger(value)&&context?.source&&/^[1-9]\d{0,255}$/.test(context.source))return context.source;
  return value;
 }) as unknown;
}
