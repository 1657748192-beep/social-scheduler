import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {createFacebookDirectoryService} from '../src/facebookManagement/directory';
import {createFacebookPageAccess} from '../src/facebookManagement/access';

async function fixture(run:(f:any)=>Promise<void>){
  const url=process.env.FACEBOOK_TEST_DATABASE_URL;assert.ok(url,'Independent database required');
  assert.match(new URL(url).pathname,/_test$/);assert.notEqual(url,process.env.DATABASE_URL);
  const db=new PrismaClient({datasources:{db:{url}}}),userId=randomUUID(),workspaceId=randomUUID(),sessionId=randomUUID();
  try{
    await db.user.create({data:{id:userId,email:`${userId}@example.test`,name:'Directory test',passwordHash:'not-real'}});
    await db.workspace.create({data:{id:workspaceId,ownerId:userId,name:'Directory',slug:workspaceId}});
    await db.workspaceMember.create({data:{workspaceId,userId,role:'owner',status:'active'}});
    await db.userSession.create({data:{id:sessionId,userId,tokenId:randomUUID(),expiresAt:new Date(Date.now()+86400000)}});
    const connection=()=>db.facebookManagementConnection.create({data:{workspaceId,userId,appId:'123',providerUserId:'200',userTokenEncrypted:'sealed:user',scopes:['business_management','pages_show_list']}});
    const first=await connection();
    let fail=false,calls=0;
    const pages=Array.from({length:21},(_,i)=>({id:String(100+i),name:'Same name',profileUrl:'https://www.facebook.com/profile.php?id=999',avatarUrl:null,pageToken:`page-${100+i}`,tasks:['MESSAGING']}));
    const client={listBusinesses:async()=>({items:[{id:'500',name:'BM'}],nextCursor:null}),
      listBusinessPages:async(_id:string,relation:string,after?:string)=>{calls++;if(fail&&after)throw Error('private-provider-token');const start=after?Number(after):0;return{items:relation==='owned'?pages.slice(start,start+7):[],nextCursor:relation==='owned'&&start+7<21?String(start+7):null};},
      listUserPages:async()=>({items:pages,nextCursor:null}),
      inspectPageToken:async(id:string)=>({pageId:id,scopes:['pages_messaging'],granularScopes:[],expiresAt:null})};
    const ctx={userId,workspaceId,sessionId};
    const directory=createFacebookDirectoryService({db,decrypt:(v:string)=>v.replace('sealed:',''),encrypt:(v:string)=>`sealed:${v}`,createClient:()=>client});
    const access=createFacebookPageAccess({db,decrypt:(v:string)=>v.replace('sealed:',''),inspect:client.inspectPageToken});
    await run({db,ctx,connection,first,directory,access,setFail:(v:boolean)=>{fail=v;},calls:()=>calls});
  }finally{await db.workspace.deleteMany({where:{id:workspaceId,ownerId:userId}});await db.user.deleteMany({where:{id:userId}});await db.$disconnect();}
}

test('sameNameAndProfileIdCannotBindPublishingAccount',async()=>fixture(async({db,ctx,first,directory}:any)=>{
  await db.socialAccount.create({data:{workspaceId:ctx.workspaceId,platform:'facebook',providerAccountId:'999',displayName:'Same name',accountType:'page'}});
  const real=await db.socialAccount.create({data:{workspaceId:ctx.workspaceId,platform:'facebook',providerAccountId:'101',displayName:'Unrelated name',accountType:'page'}});
  await directory.refresh(ctx,first.id);
  const result=await directory.list(ctx,{});
  assert.equal(result.items.length,21);
  assert.equal(result.items.find((p:any)=>p.pageId==='100').publishingAccountId,null);
  assert.equal(result.items.find((p:any)=>p.pageId==='101').publishingAccountId,real.id);
  assert.equal(JSON.stringify(result).includes('pageToken'),false);assert.equal(JSON.stringify(result).includes('sealed:'),false);
  assert.equal((await directory.list(ctx,{businessId:'500',query:'same'})).items.length,21);
  assert.equal((await directory.list(ctx,{query:'not found'})).items.length,0);
}));

test('twentyOnePagesSurvivePartialRefresh',async()=>fixture(async({ctx,first,directory,setFail,calls}:any)=>{
  const initial=await directory.refresh(ctx,first.id);assert.equal(initial.items.length,21);
  const before=calls();await directory.refresh(ctx,first.id,{force:false});assert.equal(calls(),before);
  setFail(true);
  const failed=await directory.refresh(ctx,first.id);
  assert.equal(failed.items.length,21);assert.equal(failed.stale,true);assert.ok(failed.warnings.length);
  assert.equal(failed.readAt,initial.readAt);assert.equal(JSON.stringify(failed).includes('private-provider-token'),false);
  assert.equal((await directory.list(ctx,{})).stale,true);
}));

test('foreignConnectionAndPageDenied',async()=>fixture(async({db,ctx,first,directory,access}:any)=>{
  const foreign={...ctx,workspaceId:randomUUID()};
  await assert.rejects(directory.refresh(foreign,first.id));await assert.rejects(directory.list(foreign,{}));
  await directory.refresh(ctx,first.id);const page=(await directory.list(ctx,{})).items[0];
  await assert.rejects(directory.select(foreign,page.id));
  await assert.rejects(access.resolvePageAccess({...foreign,managedPageId:page.id},{}));
  await db.workspaceMember.updateMany({where:{userId:ctx.userId,workspaceId:ctx.workspaceId},data:{role:'viewer'}});
  assert.equal((await directory.list(ctx,{})).items.length,21);
  await assert.rejects(directory.refresh(ctx,first.id));await assert.rejects(directory.select(ctx,page.id));
}));

test('duplicatePagesRequireExplicitConnectionChoice',async()=>fixture(async({db,ctx,first,connection,directory,access}:any)=>{
  await db.socialAccount.create({data:{workspaceId:ctx.workspaceId,platform:'facebook',providerAccountId:'100',displayName:'Bound',accountType:'page'}});
  const second=await connection();await directory.refresh(ctx,first.id);await directory.refresh(ctx,second.id);
  const result=await directory.list(ctx,{});assert.equal(result.items.length,21);
  const group=result.items.find((p:any)=>p.pageId==='100');assert.equal(group.connectionChoices.length,2);assert.equal(group.selectedManagedPageId,null);
  const selected=group.connectionChoices.find((c:any)=>c.connectionId===first.id).managedPageId;
  await assert.rejects(access.resolvePageAccess({...ctx,managedPageId:selected},{}));
  await directory.select(ctx,selected);
  const resolved=await access.resolvePageAccess({...ctx,managedPageId:selected},{requirePublishingBinding:true});
  assert.equal(resolved.pageId,'100');assert.equal(resolved.pageToken,'page-100');
  await db.facebookManagementConnection.update({where:{id:first.id},data:{status:'disconnected',userTokenEncrypted:null}});
  await assert.rejects(access.resolvePageAccess({...ctx,managedPageId:selected},{}));
  const alternative=group.connectionChoices.find((c:any)=>c.connectionId===second.id).managedPageId;
  await assert.rejects(access.resolvePageAccess({...ctx,managedPageId:alternative},{}));
}));

test('refreshPreservesExplicitNotificationChoiceForStillAuthorizedPages',async()=>fixture(async({db,ctx,first,directory}:any)=>{
  await directory.refresh(ctx,first.id);
  await db.facebookManagedPage.updateMany({where:{connectionId:first.id,pageId:'100'},data:{notificationsEnabled:true}});
  await directory.refresh(ctx,first.id);
  assert.equal((await db.facebookManagedPage.findUniqueOrThrow({where:{connectionId_pageId:{connectionId:first.id,pageId:'100'}}})).notificationsEnabled,true);
}));

test('removedAuthorizerIsNotShownAsAvailableOrUsedForInteraction',async()=>fixture(async({db,ctx,first,directory,access}:any)=>{
  await directory.refresh(ctx,first.id);const page=(await directory.list(ctx,{})).items[0];
  await directory.select(ctx,page.id);
  await db.workspaceMember.updateMany({where:{userId:ctx.userId,workspaceId:ctx.workspaceId},data:{role:'viewer'}});
  const result=await directory.list(ctx,{});assert.equal(result.items[0].authorization,'missing');
  assert.ok(result.items[0].connectionChoices.every((c:any)=>!c.available));
  await assert.rejects(access.resolvePageAccess({...ctx,managedPageId:page.id},{requirePublishingBinding:false}));
}));
