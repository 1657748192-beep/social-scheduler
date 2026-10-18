import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,randomUUID} from 'node:crypto';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';

test('idleSettlementIsNamespaceBoundAndDoesNotStarveBehindAnUnmappedReceipt',async()=>withMetaInboxFixture(async f=>{
 const appId=BigInt('0x'+f.userId.replace(/-/g,'')).toString(),ns={platform:'instagram' as const,appId},d=createMetaInboxDeletion({db:f.db,encrypt:encryptToken,decrypt:decryptToken}),ids:string[]=[],code=()=>randomBytes(32).toString('base64url');
 try{
  const child=await f.db.metaInboxDeletionRequest.create({data:{workspaceId:f.adminCtx.workspaceId,...ns,subjectKind:'asset',subjectHash:'a'.repeat(64),requestKey:randomUUID(),reason:'synthetic-only',confirmationCode:code(),status:'completed',completedAt:new Date()}});
  for(const [ordinal,targets,unresolved]of [['00000000',[],true],['00000001',[{id:child.id,workspaceId:child.workspaceId}],false]] as const){const row=await f.db.metaInboxAppDeletionRequest.create({data:{id:ordinal+'-0000-4000-8000-'+f.userId.slice(-12),...ns,subjectHash:'b'.repeat(64),requestKey:randomBytes(32).toString('hex'),reason:'data_deletion',confirmationCode:code(),targetEncrypted:encryptToken(JSON.stringify({version:1,targets,unresolved}))}});ids.push(row.id);}
  assert.deepEqual(await(d as any).settleNextAppDeletion({...ns,appId:appId+'1'}),{cursor:null,completed:false});
  const first=await(d as any).settleNextAppDeletion(ns);assert.equal(first.cursor,ids[0]);assert.equal(first.completed,false);
  const second=await(d as any).settleNextAppDeletion(ns,first.cursor);assert.equal(second.cursor,ids[1]);assert.equal(second.completed,true);
  assert.equal((await f.db.metaInboxAppDeletionRequest.findUniqueOrThrow({where:{id:ids[0]}})).status,'pending');
  assert.equal((await(d as any).settleNextAppDeletion(ns,second.cursor)).cursor,ids[0]);
 }finally{await f.db.metaInboxAppDeletionRequest.deleteMany({where:{id:{in:ids}}});}
}));
