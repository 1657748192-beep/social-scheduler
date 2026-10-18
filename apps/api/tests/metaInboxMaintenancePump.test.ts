import test from 'node:test';import assert from 'node:assert/strict';
import {startMetaDeletionMaintenance} from '../src/interactionInbox/deletionMaintenance';

test('apiMaintenanceSharesFiftyEntityBudgetAndNeverOverlapsTicks',async()=>{
 let tick:()=>void=()=>{},finish!:()=>void;const gate=new Promise<void>(resolve=>{finish=resolve;});
 const stages:string[]=[],limits:number[]=[];let claims=0,released=0;
 const store={claimMaintenance:async()=>{claims++;return{id:'job',confirmationCode:'receipt',claimToken:'claim'};},purgeSources:async(_code:string,limit:number)=>{stages.push('sources');limits.push(limit);await gate;return{purged:30,sourcesComplete:true};},purgeDerived:async(_code:string,limit:number)=>{stages.push('derived');limits.push(limit);return{purged:20,complete:false,blocked:null};},releaseMaintenance:async()=>{released++;return true;}};
 const pump=startMetaDeletionMaintenance({enabled:true,namespaces:[{platform:'instagram',appId:'456'}],store,schedule:((fn:()=>void)=>{tick=fn;return{unref(){}};}) as any,unschedule:()=>{}});
 tick();tick();await Promise.resolve();assert.equal(claims,1);finish();await pump.stop();
 assert.deepEqual(stages,['sources','derived']);assert.deepEqual(limits,[50,20]);assert.equal(released,1);
 tick();assert.equal(claims,1);
});

test('disabledMaintenanceNeverSchedulesOrClaims',async()=>{
 let calls=0;const pump=startMetaDeletionMaintenance({enabled:false,namespaces:[],store:{} as any,schedule:(()=>{calls++;throw Error();}) as any});await pump.stop();assert.equal(calls,0);
});

test('failedMaintenanceReleasesForBoundedRetryWithoutLeakingContent',async()=>{
 let tick:()=>void=()=>{},failed:boolean|undefined;
 const store={claimMaintenance:async()=>({id:'job',confirmationCode:'receipt',claimToken:'claim'}),purgeSources:async()=>{throw Error('private customer text');},purgeDerived:async()=>{throw Error('must not run');},releaseMaintenance:async(_claim:unknown,_now:Date,error:boolean)=>{failed=error;return true;}};
 const pump=startMetaDeletionMaintenance({enabled:true,namespaces:[{platform:'instagram',appId:'456'}],store,schedule:((fn:()=>void)=>{tick=fn;return{unref(){}};}) as any,unschedule:()=>{}});tick();await pump.stop();assert.equal(failed,true);
});
