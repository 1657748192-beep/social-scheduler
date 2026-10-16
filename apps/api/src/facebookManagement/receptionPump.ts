import type {createFacebookManagementReceptionStore} from './receptionStore';
type Store=ReturnType<typeof createFacebookManagementReceptionStore>;
export function startFacebookManagementPump(deps:{enabled:boolean;store:Pick<Store,'claimBatch'|'processClaim'|'finishClaim'|'failClaim'|'prune'>;
  schedule?:typeof setInterval;unschedule?:typeof clearInterval;now?:()=>Date}){
  if(!deps.enabled)return{stop:async()=>undefined};
  let stopped=false,inFlight:Promise<void>|null=null,lastPrune=0;
  const now=deps.now??(()=>new Date());
  async function tick(){
    if(stopped||inFlight)return;
    inFlight=(async()=>{
      const time=now();
      if(time.getTime()-lastPrune>=3600000){try{await deps.store.prune(time);lastPrune=time.getTime();}catch{/* Retry maintenance next tick; never log customer content. */}}
      try{for(const row of (await deps.store.claimBatch(now(),50)).slice(0,50)){
        if(stopped)break;
        try{await deps.store.processClaim(row,now());await deps.store.finishClaim(row.id,row.claimToken);}
        catch{try{await deps.store.failClaim(row.id,row.claimToken);}catch{/* Lease recovery will retry after the database recovers. */}}
      }}catch{/* Bounded next tick retries only event processing, never manual sends. */}
    })();
    try{await inFlight;}finally{inFlight=null;}
  }
  const timer=(deps.schedule??setInterval)(tick,2000);timer.unref?.();
  return{async stop(){stopped=true;(deps.unschedule??clearInterval)(timer);await inFlight;}};
}
