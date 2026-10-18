import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';
import {seedDeletionCustomer} from './helpers/metaInboxDeletionFixture';
import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';
import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';

async function waitForBlockedWriter(db:any,pid:number){
 const until=Date.now()+5000;
 while(Date.now()<until){const [row]=await db.$queryRaw`SELECT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE ${pid}::int = ANY(pg_blocking_pids(a.pid))) AS blocked`;if(row.blocked)return true;await new Promise(r=>setTimeout(r,10));}
 return false;
}

test('caseChangedWhilePurgeWaitsForItsRowLockPreservesNewReceiptsAndTags',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),before=await f.publishingSnapshot();
 const d=createMetaInboxDeletion({db:f.db,hmacKey:'synthetic-deletion-hmac-key-only',encrypt:encryptToken,decrypt:decryptToken});
 const a={workspaceId:f.adminCtx.workspaceId,platform:'instagram' as const,appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1};
 const receipt=await d.markItem(a,'messages',own.message.providerId);let sources=false;
 for(let i=0;i<20&&!sources;i++)sources=(await d.purgeSources(receipt.confirmationCode,2)).sourcesComplete;assert.equal(sources,true);
 assert.equal((await d.purgeDerived(receipt.confirmationCode,1)).purged,1);
 let announce!:(pid:number)=>void,rejectReady!:(error:unknown)=>void,release!:()=>void;const ready=new Promise<number>((r,j)=>{announce=r;rejectReady=j;}),gate=new Promise<void>(r=>release=r);
 const writer=f.db.$transaction(async tx=>{
  await tx.interactionCase.update({where:{id:own.cases[1].id},data:{sourceRef:{...(own.cases[1].sourceRef as object),connectionVersion:2,sourceRecordId:randomUUID()}}});
  const [row]=await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`;announce(row.pid);await gate;
 },{timeout:15000});
 void writer.catch(rejectReady);
 const pid=await ready,purge=d.purgeDerived(receipt.confirmationCode,1);void purge.catch(()=>{});let blocked=false;
 try{
  blocked=await waitForBlockedWriter(f.db,pid);
 }finally{release();await writer;}
 const result=await purge;assert.equal(blocked,true,'must exercise the real row-lock wait, not just sequential calls');
 assert.equal(result.blocked,'case_scope_changed');assert.equal(result.purged,0);assert.equal(await d.status(receipt.confirmationCode),'pending');
 assert.equal(await f.db.readReceipt.count({where:{caseId:own.cases[1].id}}),1);assert.equal(await f.db.interactionCaseTag.count({where:{caseId:own.cases[1].id}}),1);assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('assetChangedDuringRowLockWaitCannotDeleteNewEpochSyncCursor',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),d=createMetaInboxDeletion({db:f.db,hmacKey:'synthetic-deletion-hmac-key-only',encrypt:encryptToken,decrypt:decryptToken});
 const a={workspaceId:f.adminCtx.workspaceId,platform:'instagram' as const,appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1};
 const receipt=await d.markItem(a,'comments','not-indexed');let sources=false;
 for(let i=0;i<20&&!sources;i++)sources=(await d.purgeSources(receipt.confirmationCode,2)).sourcesComplete;assert.equal(sources,true);
 let announce!:(pid:number)=>void,rejectReady!:(error:unknown)=>void,release!:()=>void;const ready=new Promise<number>((r,j)=>{announce=r;rejectReady=j;}),gate=new Promise<void>(r=>release=r);
 const writer=f.db.$transaction(async tx=>{
  await tx.interactionAsset.update({where:{id:own.asset.id},data:{connectionVersion:2}});
  await tx.interactionSyncState.updateMany({where:{assetId:own.asset.id},data:{cursor:'new-epoch-cursor'}});
  const [row]=await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`;announce(row.pid);await gate;
 },{timeout:15000});void writer.catch(rejectReady);
 const pid=await ready,purge=d.purgeDerived(receipt.confirmationCode,1);void purge.catch(()=>{});let blocked=false;
 try{blocked=await waitForBlockedWriter(f.db,pid);}finally{release();await writer;}
 const result=await purge;assert.equal(blocked,true);assert.equal(result.purged,0);
 assert.equal((await f.db.interactionSyncState.findFirstOrThrow({where:{assetId:own.asset.id}})).cursor,'new-epoch-cursor');
}));
