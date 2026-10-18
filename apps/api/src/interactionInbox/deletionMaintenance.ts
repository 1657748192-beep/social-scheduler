import type {createMetaInboxDeletion} from './deletion';
import type {MetaDeletionNamespace} from './metaDeletionRoutes';
type Store=Pick<ReturnType<typeof createMetaInboxDeletion>,'claimMaintenance'|'releaseMaintenance'|'purgeSources'|'purgeDerived'>;

/** API-owned only: one leased request and at most fifty removals per tick. */
export function startMetaDeletionMaintenance({enabled,namespaces,store,schedule=setInterval,unschedule=clearInterval,now=()=>new Date()}:{enabled:boolean;namespaces:MetaDeletionNamespace[];store:Store;schedule?:typeof setInterval;unschedule?:(timer:ReturnType<typeof setInterval>)=>void;now?:()=>Date}){
 if(!enabled)return{stop:async()=>undefined};
 if(!namespaces.length||namespaces.length>2||namespaces.some(n=>!['facebook','instagram'].includes(n.platform)||!/^\d{1,256}$/.test(n.appId)))throw Error('Meta maintenance configuration unavailable');
 const scopes=namespaces.map(n=>({...n}));
 let running:Promise<void>|null=null,stopped=false,nextScope=0;
 const tick=()=>{
  if(stopped||running)return;
  const scope=scopes[nextScope];nextScope=(nextScope+1)%scopes.length;
  running=(async()=>{
   try{
    const claim=await store.claimMaintenance(scope,now());if(!claim)return;
    let failed=false;
    try{
     const source=await store.purgeSources(claim.confirmationCode,50);
     if(!Number.isInteger(source.purged)||source.purged<0||source.purged>50)throw Error('Invalid maintenance budget');
     if(source.sourcesComplete&&source.purged<50){const derived=await store.purgeDerived(claim.confirmationCode,50-source.purged);failed=derived.blocked!==null;}
    }catch{failed=true;}
    // Completed jobs already clear their lease. Stale claim release is a no-op.
    await store.releaseMaintenance(claim,now(),failed);
   }catch{/* Lease recovery and capped retries; no customer data or errors logged. */}
  })().finally(()=>{running=null;});
 };
 const timer=schedule(tick,2000);timer.unref?.();
 return{async stop(){stopped=true;unschedule(timer);await running;}};
}
