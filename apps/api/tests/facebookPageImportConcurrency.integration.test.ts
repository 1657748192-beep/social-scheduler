import assert from 'node:assert/strict';import test from 'node:test';
import {withPageImportFixture,preparePageInvitation} from './helpers/facebookPageImportInvitationsFixture';
const load=async()=>import('../src/facebookPageImportInvitations/service').catch(()=>null);
test('two invitations create a shared Page once and revocation before final admission prevents import',async()=>{
 const mod=await load();assert.ok(mod,'invitation confirmation service must exist');await withPageImportFixture(async f=>{
 const a=await preparePageInvitation(f),b=await preparePageInvitation(f),graph={revalidate:async(p:any)=>p};const service=mod.createFacebookPageImportInvitationService({...f,appId:'123',repo:a.repo,graph});
 const before=await f.snapshot(),results=await Promise.all([service.confirm(f.ctx,a.id,['101']),service.confirm(f.ctx,b.id,['101'])]);assert.equal(results.reduce((n:any,r:any)=>n+r.createdPageIds.length,0),1);assert.deepEqual(await f.snapshot(),before);
 const c=await preparePageInvitation(f);const blocked=mod.createFacebookPageImportInvitationService({...f,appId:'123',repo:c.repo,graph:{revalidate:async(p:any)=>{await service.revoke(f.ctx,c.id);return p;}}});
 await assert.rejects(blocked.confirm(f.ctx,c.id,['102']));assert.equal(await f.db.socialAccount.count({where:{workspaceId:f.ctx.workspaceId,providerAccountId:'102'}}),0);
 await assert.rejects(service.revoke(f.ctx,a.id));
 });
});
test('lost commit acknowledgement retries the saved result without replacing credentials',async()=>{
 const mod=await load();assert.ok(mod);await withPageImportFixture(async f=>{
 const a=await preparePageInvitation(f);let lost=true;
 const db=new Proxy(f.db,{get(target,key){if(key==='$transaction')return async(fn:any,options:any)=>{const value=await target.$transaction(fn,options);if(lost&&await target.facebookPageImportInvitation.findFirst({where:{id:a.id,status:'completed'}})){lost=false;throw Error('lost COMMIT reply');}return value;};return Reflect.get(target,key);}});
 const service=mod.createFacebookPageImportInvitationService({...f,db,appId:'123',repo:a.repo,graph:{revalidate:async(p:any)=>p}});
 await assert.rejects(service.confirm(f.ctx,a.id,['101']));const first=await f.db.socialAccount.findFirst({where:{workspaceId:f.ctx.workspaceId,providerAccountId:'101'},include:{credential:true}});assert.ok(first);
 assert.deepEqual(await service.confirm(f.ctx,a.id,['101']),{createdPageIds:['101'],skippedPageIds:[]});assert.deepEqual(await f.db.socialAccount.findUnique({where:{id:first.id},include:{credential:true}}),first);
 });
});
