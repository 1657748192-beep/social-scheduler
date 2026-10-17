import type {createInstagramManagementReceptionStore} from './receptionStore';
type Store=ReturnType<typeof createInstagramManagementReceptionStore>;
export function startInstagramManagementPump({enabled,store,schedule=setInterval,unschedule=clearInterval,now=()=>new Date()}:{enabled:boolean;store:Pick<Store,'claimBatch'|'processClaim'|'finishClaim'|'failClaim'|'prune'>;schedule?:typeof setInterval;unschedule?:(timer:ReturnType<typeof setInterval>)=>void;now?:()=>Date}){
 if(!enabled)return{stop:async()=>undefined};
 let running:Promise<void>|null=null,stopped=false,lastPrune=0;
 const tick=()=>{
  if(stopped||running)return;
  running=(async()=>{
   const current=now();if(current.getTime()-lastPrune>=3600000){try{await store.prune(current);lastPrune=current.getTime();}catch{/* Bounded next-tick retry; no customer content logs. */}}
   try{for(const claim of (await store.claimBatch(now(),50)).slice(0,50)){if(stopped)break;try{await store.processClaim(claim,now());await store.finishClaim(claim.id,claim.claimToken);}catch{try{await store.failClaim(claim.id,claim.claimToken);}catch{/* Lease recovery retries processing, never a manual send. */}}}}catch{/* Retry claims on the next bounded tick. */}
  })().finally(()=>{running=null;});
 };
 const timer=schedule(tick,2000);timer.unref?.();
 return{async stop(){stopped=true;unschedule(timer);await running;}};
}
