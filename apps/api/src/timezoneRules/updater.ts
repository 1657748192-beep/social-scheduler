import {randomUUID} from 'node:crypto';
import {baselineBundle,compareVersions,validateBundle,createRuleSnapshot,type RuleBundle} from '@social-scheduler/timezone-rules';
export type RuleStatus={activeVersion:string;upstreamVersion?:string;lastCheckedAt?:number;state:'ok'|'pending-upstream'|'failed'|'baseline-only';errorCode?:string};
export interface RuleStore{readActive():Promise<RuleBundle|null>;tryLock(owner:string,ttlMs:number):Promise<boolean>;activate(owner:string,bundle:RuleBundle):Promise<boolean>;release(owner:string):Promise<void>;record(status:RuleStatus):Promise<void>;status():Promise<RuleStatus>}
export function validateCandidate(bundle:RuleBundle,active:RuleBundle){
 const b=validateBundle(bundle),rules=createRuleSnapshot(b),old=createRuleSnapshot(active);
 if(compareVersions(b.tzdbVersion,active.tzdbVersion)<0||(b.tzdbVersion===active.tzdbVersion&&b.sha256!==active.sha256))throw Error('version-conflict');
 for(const packed of active.data.zones){if(!rules.canonicalZone(packed.split('|')[0]))throw Error('coverage');}
 for(const link of active.data.links){if(!rules.canonicalZone(link.split('|')[1]))throw Error('coverage');}
 // Stable historical anchors. Future policies may change; confirmed old instants must not silently drift.
 for(const id of ['Asia/Shanghai','America/New_York','Asia/Kathmandu','America/Winnipeg','America/Edmonton','America/Inuvik','Africa/Casablanca','Africa/El_Aaiun']){
  for(const instant of ['2020-01-01T12:00:00Z','2026-11-06T12:00:00Z'])if(rules.offsetAt(id,Date.parse(instant))!==old.offsetAt(id,Date.parse(instant)))throw Error('anchor-changed');
 }
 return b;
}
export async function checkRulesOnce({source,store,now=Date.now,signal}:{source:()=>Promise<{ianaVersion:string;bundle:RuleBundle|null}>;store:RuleStore;now?:()=>number;signal?:AbortSignal}):Promise<RuleStatus>{
 let active=baselineBundle;const owner=randomUUID();let locked=false;let status:RuleStatus={activeVersion:active.tzdbVersion,state:'failed',lastCheckedAt:now()};
 try{
  active=await store.readActive()??baselineBundle;status.activeVersion=active.tzdbVersion;
  locked=await store.tryLock(owner,120000);if(!locked)return await store.status();
  signal?.throwIfAborted();const candidate=await source();signal?.throwIfAborted();status.upstreamVersion=candidate.ianaVersion;
  if(!candidate.bundle||compareVersions(candidate.bundle.tzdbVersion,candidate.ianaVersion)<0)status.state='pending-upstream';
  else{
   if(candidate.bundle.tzdbVersion!==candidate.ianaVersion)throw Error('upstream-version-mismatch');
   const b=validateCandidate(candidate.bundle,active);
   if(b.sha256!==active.sha256&&!await store.activate(owner,b))throw Error('activation-rejected');
   status={...status,state:'ok',activeVersion:b.tzdbVersion};
  }
 }catch{status={...status,state:'failed',errorCode:'rules-update-unavailable'};}
 finally{if(locked)await store.release(owner).catch(()=>undefined);}
 await store.record(status).catch(()=>undefined);return status;
}
