import assert from 'node:assert/strict';
import test from 'node:test';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
import {encryptToken} from '../src/utils/tokenCrypto';
const page=(id:string)=>({pageId:id,name:'Same name',avatarUrl:null,profileUrl:'https://www.facebook.com/'+id,pageToken:'new-'+id,scopes:['pages_manage_posts','pages_read_engagement'],expiresAt:null});
test('insert-only kernel leaves existing inactive and active pages byte for byte unchanged',async()=>{
 const mod=await import('../src/facebookPageSync/insertNewPages').catch(()=>null);assert.ok(mod,'insert-only kernel must exist');
 await withFacebookManagementFixture(async f=>{
  await f.db.socialAccount.update({where:{id:f.accounts[0].id},data:{status:'disconnected'}});const before=await f.snapshot();
  const result=await f.db.$transaction((tx:any)=>mod.insertNewFacebookPages(tx,{workspaceId:f.workspaceIds[0],operationId:'new-invitation',selectedPageIds:['100','101','102'],verifiedPages:['101','102'].map(page),encrypt:encryptToken,assertCurrent:async()=>{}}));
  assert.deepEqual(result,{createdPageIds:['101','102'],skippedPageIds:['100']});
  const old=await f.db.socialAccount.findMany({where:{id:{in:f.accounts.map((a:any)=>a.id)}},include:{credential:true},orderBy:{id:'asc'}});assert.deepEqual(old,before);
 });
});
test('two imports share the same page lock and only one creates credentials',async()=>{
 const mod=await import('../src/facebookPageSync/insertNewPages').catch(()=>null);assert.ok(mod);
 await withFacebookManagementFixture(async f=>{
  const insert=(operationId:string)=>f.db.$transaction((tx:any)=>mod.insertNewFacebookPages(tx,{workspaceId:f.workspaceIds[0],operationId,selectedPageIds:['101'],verifiedPages:[page('101')],encrypt:encryptToken,assertCurrent:async()=>{}}));
  const results=await Promise.all([insert('a'),insert('b')]);assert.equal(results.reduce((n,r)=>n+r.createdPageIds.length,0),1);
  const winner=await f.db.socialAccount.findFirst({where:{workspaceId:f.workspaceIds[0],providerAccountId:'101'},include:{credential:true}});
  assert.deepEqual(await insert('c'),{createdPageIds:[],skippedPageIds:['101']});
  assert.deepEqual(await f.db.socialAccount.findUnique({where:{id:winner.id},include:{credential:true}}),winner);
 });
});
