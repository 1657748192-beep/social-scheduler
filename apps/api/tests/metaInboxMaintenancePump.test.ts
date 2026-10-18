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

test('idlePumpAdvancesTheAppReceiptCursorWithoutSpendingSourcePurgeBudget',async()=>{
 let tick:()=>void=()=>{};const cursors:Array<string|undefined>=[],cursor='11111111-1111-4111-8111-111111111111';
 const store={claimMaintenance:async()=>null,purgeSources:async()=>{throw Error('Idle pump must not purge');},purgeDerived:async()=>{throw Error('Idle pump must not purge');},releaseMaintenance:async()=>true,settleNextAppDeletion:async(_ns:unknown,after?:string)=>{cursors.push(after);return{cursor,completed:false};}};
 const pump=startMetaDeletionMaintenance({enabled:true,namespaces:[{platform:'instagram',appId:'456'}],store,schedule:((fn:()=>void)=>{tick=fn;return{unref(){}};}) as any,unschedule:()=>{}});
 tick();await new Promise(resolve=>setImmediate(resolve));tick();await pump.stop();assert.deepEqual(cursors,[undefined,cursor]);
});

test('expiryGetsReservedTicksWithoutStarvingEitherPlatformOrAddingAnotherBudget',async()=>{
 let tick:()=>void=()=>{},expiry=0,purges=0;const claims:string[]=[];
 const store={claimMaintenance:async(n:any)=>{claims.push(n.platform);return{id:'job',confirmationCode:'receipt',claimToken:'claim'};},purgeSources:async()=>{purges++;return{purged:50,sourcesComplete:false};},purgeDerived:async()=>{throw Error('No budget left');},releaseMaintenance:async()=>true,maintenance:async()=>{expiry++;return 50;}};
 const pump=startMetaDeletionMaintenance({enabled:true,namespaces:[{platform:'facebook',appId:'123'},{platform:'instagram',appId:'456'}],store,schedule:((fn:()=>void)=>{tick=fn;return{unref(){}};}) as any,unschedule:()=>{}});
 for(let i=0;i<8;i++){tick();await new Promise(resolve=>setImmediate(resolve));}await pump.stop();
 assert.equal(expiry,2);assert.equal(purges,6);assert.deepEqual(claims,['facebook','instagram','facebook','instagram','facebook','instagram']);
});
