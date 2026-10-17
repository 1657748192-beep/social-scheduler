import test from 'node:test';import assert from 'node:assert/strict';
import {withInboxFixture} from './helpers/interactionInboxFixture';
import {inboxTestAccess,inboxTestPolicy} from './helpers/interactionInboxServices';
import {createInboxProjection} from '../src/interactionInbox/projection';
import {createFacebookInboxAdapter} from '../src/interactionInbox/adapters/facebook';
import {createInboxAccess} from '../src/interactionInbox/access';
const page={items:[],nextCursor:null,coverage:'synthetic',warnings:[]};
test('factoryRuleDoesNotEnableOtherPages',async()=>withInboxFixture(async f=>{
 const c=f.connections[0],p=await f.db.facebookManagedPage.create({data:{connectionId:c.id,pageId:'101',name:'Factory Wholesale',active:true,pageTokenEncrypted:'sealed',scopes:['pages_messaging'],tasks:['MESSAGING']}});
 await f.db.facebookManagementPageSelection.create({data:{workspaceId:f.adminCtx.workspaceId,pageId:'101',managedPageId:p.id}});
 const other=await f.db.socialAccount.create({data:{workspaceId:f.adminCtx.workspaceId,platform:'facebook',providerAccountId:'101',displayName:'Factory Wholesale',accountType:'page'}}),access=inboxTestAccess(f),before=await f.protectedSnapshot();
 await access.resolveInboxAsset(f.adminCtx,f.accountIds[0],'messages.read');await assert.rejects(access.resolveInboxAsset(f.adminCtx,other.id,'messages.read'),(e:any)=>e.statusCode===409);assert.deepEqual(await f.protectedSnapshot(),before);
}));
test('projectionChecksCurrentSelectionInsideTransaction',async()=>withInboxFixture(async f=>{
 const access=inboxTestAccess(f),asset=await access.resolveInboxAsset(f.adminCtx,f.accountIds[0]),write=access.write;
 access.write=async(ctx,fn,mode)=>{await f.db.facebookManagementPageSelection.delete({where:{workspaceId_pageId:{workspaceId:ctx.workspaceId,pageId:'100'}}});return write(ctx,fn,mode);};
 const before=await f.protectedSnapshot();await assert.rejects(createInboxProjection({db:f.db,access,policy:inboxTestPolicy(f)}).projectVerifiedPage(f.adminCtx,asset,page));
 assert.equal(await f.db.interactionAsset.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
 await f.db.facebookManagementPageSelection.create({data:{workspaceId:f.adminCtx.workspaceId,pageId:'100',managedPageId:f.pages[0].id}});
 // New selection row has a new bookkeeping ID; publishing account/credential snapshot remains identical.
 assert.deepEqual((await f.protectedSnapshot() as any).accounts,(before as any).accounts);
}));
test('connectionChangesAfterProviderReadRejectsProjection',async()=>withInboxFixture(async f=>{
 const access=inboxTestAccess(f),asset=await access.resolveInboxAsset(f.adminCtx,f.accountIds[0]),write=access.write;
 access.write=async(ctx,fn,mode)=>{await f.db.facebookManagementConnection.update({where:{id:f.connections[0].id},data:{appId:'124'}});return write(ctx,fn,mode);};
 try{await assert.rejects(createInboxProjection({db:f.db,access,policy:inboxTestPolicy(f)}).projectVerifiedPage(f.adminCtx,asset,page));assert.equal(await f.db.interactionAsset.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);}
 finally{await f.db.facebookManagementConnection.update({where:{id:f.connections[0].id},data:{appId:'123'}});}
}));
test('graphPaginationDuplicatesDoNotDuplicateCustomers',async()=>withInboxFixture(async f=>{
 const access=inboxTestAccess(f),asset=await access.resolveInboxAsset(f.adminCtx,f.accountIds[0]),projection=createInboxProjection({db:f.db,access,policy:inboxTestPolicy(f)}),before=await f.protectedSnapshot();
 const event:any={providerEventId:'m1',threadId:'t1',actorId:'300',actorName:'Synthetic',kind:'messages',occurredAt:new Date().toISOString(),inbound:true,deleted:false,sourceRef:{...asset.sourceRef,conversationId:'t1',participantId:'300'}};
 await projection.projectVerifiedPage(f.adminCtx,asset,{...page,items:[event,event]});await projection.projectVerifiedPage(f.adminCtx,asset,{...page,items:[event]});
 assert.equal(await f.db.interactionCustomer.count({where:{workspaceId:f.adminCtx.workspaceId}}),1);assert.equal(await f.db.interactionItem.count({where:{workspaceId:f.adminCtx.workspaceId}}),1);assert.deepEqual(await f.protectedSnapshot(),before);
}));
test('commentsCoverageIsVerifiedPublishedPostsOnly',async()=>withInboxFixture(async f=>{
 const access=inboxTestAccess(f),asset=await access.resolveInboxAsset(f.adminCtx,f.accountIds[0]),before=await f.protectedSnapshot();
 const result=await createFacebookInboxAdapter({db:f.db,engagement:{} as any}).list(asset,'comments',null,25);assert.equal(result.coverage,'verified_published_posts');assert.deepEqual(result.items,[]);assert.deepEqual(await f.protectedSnapshot(),before);
}));
test('pageTasksRevokedDuringCapabilityFetchDenyRead',async()=>withInboxFixture(async f=>{
 const access=createInboxAccess({db:f.db,facebookEnabled:true,policy:inboxTestPolicy(f),verifyFacebook:async()=>{
  await f.db.facebookManagedPage.update({where:{id:f.pages[0].id},data:{tasks:['MANAGE']}});
  return{readMessages:{status:'available'}};
 }});
 await assert.rejects(access.resolveInboxAsset(f.adminCtx,f.accountIds[0],'messages.read'));
}));
test('projectionRechecksKindSpecificTaskInsideTransaction',async()=>withInboxFixture(async f=>{
 const access=inboxTestAccess(f),asset=await access.resolveInboxAsset(f.adminCtx,f.accountIds[0]),write=access.write;
 access.write=async(ctx,fn,mode)=>{await f.db.facebookManagedPage.update({where:{id:f.pages[0].id},data:{tasks:['MANAGE']}});return write(ctx,fn,mode);};
 const item:any={providerEventId:'m-revoked',threadId:'thread',actorId:'300',actorName:'Synthetic',kind:'messages',occurredAt:new Date().toISOString(),inbound:true,deleted:false,sourceRef:{...asset.sourceRef,conversationId:'thread',participantId:'300'}};
 await assert.rejects(createInboxProjection({db:f.db,access,policy:inboxTestPolicy(f)}).projectVerifiedPage(f.adminCtx,asset,{...page,items:[item]}));
 assert.equal(await f.db.interactionCustomer.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
}));
