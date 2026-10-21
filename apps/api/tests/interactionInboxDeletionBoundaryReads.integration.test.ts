import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {withInboxFixture,type InboxFixture} from './helpers/interactionInboxFixture';
import {inboxTestAccess} from './helpers/interactionInboxServices';
import {createInboxReads} from '../src/interactionInbox/reads';
import {deriveMetaDeletionKey} from '../src/utils/tokenCrypto';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';
import {seedDeletionCustomer} from './helpers/metaInboxDeletionFixture';
import {sourceDeletionBoundarySql} from '../src/interactionInbox/sourceDeletionBoundary';
import {Prisma} from '@prisma/client';
import {createFacebookInboxAdapter} from '../src/interactionInbox/adapters/facebook';
import {createInboxProjection} from '../src/interactionInbox/projection';
import {inboxTestPolicy} from './helpers/interactionInboxServices';

function reads(f:InboxFixture){return createInboxReads({db:f.db,access:inboxTestAccess(f),registry:{getInboxAdapter:()=>{throw Error('List must not read provider bodies');}} as any,redis:{eval:async()=>{throw Error('Non-search list must not use search rate limit');}} as any});}
async function comment(f:InboxFixture,actorId:string,at:Date){
 const row=await f.seedVerifiedCase(0,actorId);
 await f.db.interactionSyncState.upsert({where:{assetId_kind:{assetId:row.assetId,kind:'comments'}},create:{workspaceId:row.workspaceId,assetId:row.assetId,kind:'comments',status:'ok',lastSuccessAt:new Date()},update:{}});
 return f.db.interactionCase.update({where:{id:row.id},data:{kind:'comments',providerThreadOrEventId:'comment-'+actorId,lastInboundAt:at,sourceRef:{platform:'facebook',managedPageId:f.pages[0].id,connectionId:f.connections[0].id,connectionVersion:1,commentId:'100_'+actorId}}});
}
async function marker(f:InboxFixture,parts:unknown[],at:Date,index=0,providerAssetId='100'){
 const workspaceId=f.workspaceIds[index],subjectHash=createHmac('sha256',deriveMetaDeletionKey()).update(JSON.stringify([workspaceId,'facebook','123',providerAssetId,'asset',...parts])).digest('hex');
 return f.db.metaInboxDeletionMarker.create({data:{workspaceId,platform:'facebook',appId:'123',subjectKind:'asset',subjectHash,createdAt:at}});
}

test('asset deletion cutoff filters old and equal-time comments before counts and pagination without removing protection',async()=>withInboxFixture(async f=>{
 const cutoff=new Date(Date.now()-60000),old=await comment(f,'301',new Date(cutoff.getTime()-1)),equal=await comment(f,'302',cutoff),fresh=await comment(f,'303',new Date(cutoff.getTime()+1)),newest=await comment(f,'304',new Date(cutoff.getTime()+2));
 await marker(f,['cutoff'],cutoff);
 const service=reads(f),query={accountIds:[f.accountIds[0]],kind:'comments',limit:1},protectedBefore=await f.protectedSnapshot(),markers=await f.db.metaInboxDeletionMarker.findMany({where:{workspaceId:f.adminCtx.workspaceId}}),cases=await f.db.interactionCase.findMany({where:{workspaceId:f.adminCtx.workspaceId},orderBy:{id:'asc'}});
 await assert.rejects(service.getCase(f.adminCtx,old.id,query),(e:any)=>e.statusCode===404);
 const first=await service.listCases(f.adminCtx,query);
 assert.deepEqual(first.items.map(x=>x.id),[newest.id]);assert.equal(first.accountsStatus[0].count,2);assert.ok(first.nextCursor);
 const second=await service.listCases(f.adminCtx,{...query,cursor:first.nextCursor});
 assert.deepEqual(second.items.map(x=>x.id),[fresh.id]);assert.equal(second.accountsStatus[0].count,2);assert.equal(second.nextCursor,null);
 const all=await service.listCases(f.adminCtx,{...query,limit:25});assert.deepEqual(all.items.map(x=>x.id),[newest.id,fresh.id]);assert.equal(all.items.some(x=>x.id===equal.id),false);assert.equal(all.partial,false);
 assert.deepEqual(await f.protectedSnapshot(),protectedBefore);assert.deepEqual(await f.db.metaInboxDeletionMarker.findMany({where:{workspaceId:f.adminCtx.workspaceId}}),markers);assert.deepEqual(await f.db.interactionCase.findMany({where:{workspaceId:f.adminCtx.workspaceId},orderBy:{id:'asc'}}),cases);
}));

test('deletion boundaries do not cross workspace or Page namespace and epoch protection remains closed',async()=>withInboxFixture(async f=>{
 const row=await comment(f,'311',new Date()),service=reads(f),query={accountIds:[f.accountIds[0]],kind:'comments'};
 await marker(f,['cutoff'],new Date(Date.now()+60000),1);await marker(f,['cutoff'],new Date(Date.now()+60000),0,'999');
 assert.deepEqual((await service.listCases(f.adminCtx,query)).items.map(x=>x.id),[row.id]);
 await marker(f,['connection',f.connections[0].id,'version',1],new Date());
 const closed=await service.listCases(f.adminCtx,query);assert.deepEqual(closed.items,[]);assert.equal(closed.accountsStatus[0].count,0);await assert.rejects(service.getCase(f.adminCtx,row.id,query),(e:any)=>e.statusCode===404);
}));

test('raw-backed comment cutoff follows source occurrence rather than cache receive or case time',async()=>withInboxFixture(async f=>{
 const cutoff=new Date(Date.now()-60000),c=await comment(f,'321',new Date()),ref=c.sourceRef as any;
 const source=await f.db.facebookInteractionComment.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,providerId:ref.commentId,postId:'100_post',text:'Synthetic protected source',occurredAt:cutoff,receivedAt:new Date()}});
 await f.db.interactionCase.update({where:{id:c.id},data:{sourceRef:{...ref,sourceRecordId:source.id,postId:'100_post'}}});await marker(f,['cutoff'],cutoff);
 const query={accountIds:[f.accountIds[0]],kind:'comments'},service=reads(f);
 assert.deepEqual((await service.listCases(f.adminCtx,query)).items,[]);
 await f.db.facebookInteractionComment.update({where:{id:source.id},data:{occurredAt:new Date(cutoff.getTime()+1)}});
 assert.deepEqual((await service.listCases(f.adminCtx,query)).items.map(x=>x.id),[c.id]);
}));

test('legacy version deletion markers are not ignored by list admission',async()=>withInboxFixture(async f=>{
 const c=await comment(f,'331',new Date());await marker(f,['version',1],new Date());
 const result=await reads(f).listCases(f.adminCtx,{accountIds:[f.accountIds[0]],kind:'comments'});assert.deepEqual(result.items,[]);assert.equal(result.accountsStatus[0].count,0);assert.ok(await f.db.interactionCase.findUnique({where:{id:c.id}}));
}));

test('Instagram body-backed cutoff uses each original source clock without changing Facebook admission',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),cutoff=new Date(Date.now()-60000),workspaceId=f.adminCtx.workspaceId;
 await f.db.instagramInteractionComment.update({where:{id:own.comment.id},data:{occurredAt:cutoff}});
 await f.db.instagramInteractionMessage.update({where:{id:own.message.id},data:{occurredAt:new Date(cutoff.getTime()+1)}});
 const subjectHash=createHmac('sha256',deriveMetaDeletionKey()).update(JSON.stringify([workspaceId,'instagram','456','100','asset','cutoff'])).digest('hex');
 await f.db.metaInboxDeletionMarker.create({data:{workspaceId,platform:'instagram',appId:'456',subjectKind:'asset',subjectHash,createdAt:cutoff}});
 const asset:any={ctx:f.adminCtx,accountId:f.instagramAccountIds[0],platform:'instagram',appNamespace:'456',providerAssetId:'100',connectionVersion:1,sourceRef:{platform:'instagram',connectionId:f.instagramConnectionIds[0],connectionVersion:1,instagramAccountId:f.instagramAccountIds[0]}};
 const boundary=await sourceDeletionBoundarySql(f.db,asset),rows=await f.db.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT c.id FROM "InteractionCase" c WHERE c."assetId"=${own.asset.id}::uuid AND ${boundary}`);
 assert.deepEqual(rows.map(x=>x.id),[own.cases[1].id]);
 const facebook=await comment(f,'341',new Date(cutoff.getTime()-1));assert.deepEqual((await reads(f).listCases(f.adminCtx,{accountIds:[f.accountIds[0]],kind:'comments'})).items.map(x=>x.id),[facebook.id]);
}));

test('verified canonical comment source joins its Webhook body while historical photo publication remains unchanged',async()=>withInboxFixture(async f=>{
 const post=await f.db.post.create({data:{workspaceId:f.adminCtx.workspaceId,authorId:f.userId,baseText:'Synthetic published photo',variants:{create:{platform:'facebook',socialAccountId:f.accountIds[0],text:'Synthetic published photo',publishStatus:'published'}}},include:{variants:true}}),variant=post.variants[0];
 const schedule=await f.db.schedule.create({data:{workspaceId:f.adminCtx.workspaceId,postVariantId:variant.id,createdBy:f.userId,scheduledAt:new Date(),status:'published',publishJobs:{create:{workspaceId:f.adminCtx.workspaceId,postVariantId:variant.id,status:'succeeded',idempotencyKey:randomUUID(),providerPostId:'200'}}}});
 const now=new Date(),raw=await f.db.facebookInteractionComment.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,providerId:'200_1',postId:'100_201',text:'Synthetic new comment',occurredAt:now}}),before=await f.protectedSnapshot();
 const access=inboxTestAccess(f),asset=await access.resolveInboxAsset(f.adminCtx,f.accountIds[0],'comments.read');
 const engagement:any={commentReadScheduleId:schedule.id,comments:async()=>({items:[{id:'200_1',postId:'100_201',text:'Synthetic new comment',timestamp:now.toISOString()}],nextCursor:null})};
 const page=await createFacebookInboxAdapter({db:f.db,engagement}).list(asset,'comments',null,25);
 assert.equal(page.items[0].sourceRef.postId,'100_201');
 assert.equal((await createInboxProjection({db:f.db,access,policy:inboxTestPolicy(f)}).projectVerifiedPage(f.adminCtx,asset,page)).count,1);
 const c=await f.db.interactionCase.findFirstOrThrow({where:{workspaceId:f.adminCtx.workspaceId,kind:'comments'}});assert.equal((c.sourceRef as any).sourceRecordId,raw.id);assert.equal((await access.resolveCase(f.adminCtx,c.id)).row.id,c.id);
 assert.deepEqual(await f.protectedSnapshot(),before);assert.deepEqual(await f.db.facebookInteractionComment.findUnique({where:{id:raw.id}}),raw);
}));
