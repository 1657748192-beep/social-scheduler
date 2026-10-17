import test from 'node:test';import assert from 'node:assert/strict';import Redis from 'ioredis';import {withInboxFixture} from './helpers/interactionInboxFixture';import {inboxTestAccess} from './helpers/interactionInboxServices';
test('partialAccountsNeverBecomeSuccessfulZero and cursor scope is enforced',async()=>withInboxFixture(async f=>{
 const m=await import('../src/interactionInbox/reads').catch(()=>null);assert.ok(m,'scoped read service required');const redis=new Redis(require('../../../scripts/run-tests.cjs').environment(true,true).LOCAL_UPLOAD_TEST_REDIS_URL);
 try{
 const a=await f.seedVerifiedCase(),access=inboxTestAccess(f);await f.db.interactionSyncState.create({data:{workspaceId:a.workspaceId,assetId:a.assetId,kind:'messages',status:'ok',lastSuccessAt:new Date()}});
 const second=await f.db.socialAccount.create({data:{workspaceId:a.workspaceId,platform:'tiktok',displayName:'Other',providerAccountId:'other'}});
 const registry:any={getInboxAdapter:()=>({detail:async()=>({items:[],nextCursor:null,officialUrl:null,replyTarget:null,capabilities:[]})})};
 const reads=m.createInboxReads({db:f.db,access,registry,redis}),query={accountIds:[f.accountIds[0],second.id],kind:'messages',limit:1};
 const before=await f.protectedSnapshot(),page=await reads.listCases(f.adminCtx,query);assert.equal(page.partial,true);assert.equal(page.items.length,1);assert.equal(page.accountsStatus.find((r:any)=>r.accountId===second.id)?.count,null);assert.deepEqual(await f.protectedSnapshot(),before);
 const searched=await reads.listCases(f.adminCtx,{...query,q:'Same'});assert.equal(searched.items.length,1);
 const injection=await reads.listCases(f.adminCtx,{...query,q:"%' OR 1=1 --"});assert.equal(injection.items.length,0);
 const c=await import('../src/interactionInbox/cursor'),token=c.encodeInboxCursor({workspaceId:'a'},{after:'b'});assert.throws(()=>c.decodeInboxCursor({workspaceId:'b'},token));assert.throws(()=>c.decodeInboxCursor({workspaceId:'a'},token+'bad'));
 await f.db.facebookManagementPageSelection.deleteMany({where:{workspaceId:a.workspaceId}});const revoked=await reads.listCases(f.adminCtx,query);assert.equal(revoked.items.length,0);assert.equal(revoked.partial,true);
 }finally{redis.disconnect();}
}));
test('listDoesNotRefreshOrCreateIndexes and search is rate limited',async()=>withInboxFixture(async f=>{
 const m=await import('../src/interactionInbox/reads').catch(()=>null);assert.ok(m);const redis=new Redis(require('../../../scripts/run-tests.cjs').environment(true,true).LOCAL_UPLOAD_TEST_REDIS_URL);
 try{const reads=m.createInboxReads({db:f.db,access:inboxTestAccess(f),registry:{getInboxAdapter:()=>{throw Error('GET list must not call provider');}} as any,redis});
 for(let i=0;i<30;i++)await reads.listCases(f.adminCtx,{accountIds:[f.accountIds[0]],kind:'messages',q:'literal'});
 await assert.rejects(reads.listCases(f.adminCtx,{accountIds:[f.accountIds[0]],kind:'messages',q:'literal'}),(e:any)=>e.statusCode===429);
 assert.equal(await f.db.interactionCase.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
 }finally{redis.disconnect();}
}));
