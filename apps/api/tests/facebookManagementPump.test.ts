import assert from 'node:assert/strict';
import test from 'node:test';
import {startFacebookManagementPump} from '../src/facebookManagement/receptionPump';
test('pumpIsBoundedNonReentrantAndStopWaitsForInFlight',async()=>{
  let callback!:()=>Promise<void>,milliseconds=0,cleared=false,claims=0,processed=0,prunes=0,release!:()=>void,entered!:(v:boolean)=>void;
  const ready=new Promise<boolean>(r=>{entered=r;}),hold=new Promise<void>(r=>{release=r;});
  const store={claimBatch:async(_now:Date,limit:number)=>{assert.equal(limit,50);claims++;return Array.from({length:75},(_,i)=>({id:String(i),claimToken:'lease'}));},
    processClaim:async()=>{processed++;entered(true);await hold;},finishClaim:async()=>true,failClaim:async()=>undefined,prune:async()=>{prunes++;}};
  const pump=startFacebookManagementPump({enabled:true,store:store as any,schedule:((fn:any,ms:number)=>{callback=fn;milliseconds=ms;return{unref(){}};}) as any,unschedule:()=>{cleared=true;}});
  assert.equal(milliseconds,2000);
  const first=callback();assert.equal(await Promise.race([ready,first.then(()=>false)]),true);
  await callback();assert.equal(claims,1);
  let stopped=false;const stopping=pump.stop().then(()=>{stopped=true;});await Promise.resolve();assert.equal(stopped,false);
  release();await stopping;await first;await callback();
  assert.equal(cleared,true);assert.equal(claims,1);assert.ok(processed<=50);assert.equal(prunes,1);
});
test('disabledPumpCreatesNoTimerAndNeverTouchesStore',async()=>{
  let calls=0;const pump=startFacebookManagementPump({enabled:false,store:{} as any,schedule:(()=>{calls++;}) as any});await pump.stop();assert.equal(calls,0);
});
test('pumpNeverProcessesMoreThanFiftyEvenIfClaimDependencyReturnsExtraRows',async()=>{
  let callback!:()=>Promise<void>,processed=0;
  const store={claimBatch:async(_now:Date,limit:number)=>{assert.equal(limit,50);return Array.from({length:75},(_,i)=>({id:String(i),claimToken:'lease'}));},processClaim:async()=>{processed++;return true;},finishClaim:async()=>true,failClaim:async()=>true,prune:async()=>undefined};
  const pump=startFacebookManagementPump({enabled:true,store:store as any,schedule:((fn:any)=>{callback=fn;return{unref(){}};}) as any,unschedule:()=>undefined});
  await callback();assert.equal(processed,50);await pump.stop();
});
