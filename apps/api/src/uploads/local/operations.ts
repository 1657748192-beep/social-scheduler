const active=new Map<string,Set<{controller:AbortController;finished:Promise<void>}>>();
export function beginUploadOperation(id:string,parent?:AbortSignal){
 const controller=new AbortController();let finish!:()=>void;
 const entry={controller,finished:new Promise<void>(resolve=>{finish=resolve;})};
 let set=active.get(id);if(!set){set=new Set();active.set(id,set);}set.add(entry);
 const abort=()=>controller.abort(parent?.reason);parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)abort();
 return {signal:controller.signal,abort:()=>controller.abort(),done:()=>{parent?.removeEventListener('abort',abort);set!.delete(entry);if(!set!.size)active.delete(id);finish();}};
}
export async function abortLocalUploads(id?:string){
 const entries=id?[...(active.get(id)??[])]:[...active.values()].flatMap(set=>[...set]);
 for(const entry of entries)entry.controller.abort();
 await Promise.all(entries.map(entry=>entry.finished));
}
