import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {createFacebookSendExecutor} from '../src/facebookManagement/sendAttempts';

async function fixture(run:(f:any)=>Promise<void>){
  const url=process.env.FACEBOOK_TEST_DATABASE_URL;assert.ok(url,'Independent database required');assert.match(new URL(url).pathname,/_test$/);assert.notEqual(url,process.env.DATABASE_URL);
  const db=new PrismaClient({datasources:{db:{url}}}),userId=randomUUID(),workspaceId=randomUUID(),sessionId=randomUUID();
  try{
    await db.user.create({data:{id:userId,email:`${userId}@example.test`,name:'Send test',passwordHash:'not-real'}});
    await db.workspace.create({data:{id:workspaceId,ownerId:userId,name:'Test',slug:workspaceId}});
    await db.workspaceMember.create({data:{userId,workspaceId,role:'owner',status:'active'}});
    await db.userSession.create({data:{id:sessionId,userId,tokenId:randomUUID(),expiresAt:new Date(Date.now()+86400000)}});
    const connection=await db.facebookManagementConnection.create({data:{appId:'123',userId,workspaceId,providerUserId:'200',userTokenEncrypted:'sealed:user',scopes:['pages_messaging']}});
    const page=await db.facebookManagedPage.create({data:{connectionId:connection.id,pageId:'100',name:'Page',pageTokenEncrypted:'sealed:page',tasks:['MESSAGING'],scopes:['pages_messaging']}});
    await db.facebookManagementPageSelection.create({data:{workspaceId,pageId:'100',managedPageId:page.id}});
    await db.socialAccount.create({data:{workspaceId,platform:'facebook',providerAccountId:'100',accountType:'page',displayName:'Page'}});
    const ctx={userId,workspaceId,sessionId,managedPageId:page.id};
    const executor=createFacebookSendExecutor({db});
    await run({db,ctx,execute:executor.executeFacebookSend,input:{requestKey:randomUUID(),kind:'message',targetId:'300',text:'Private draft never stored'}});
  }finally{await db.workspace.deleteMany({where:{id:workspaceId,ownerId:userId}});await db.user.deleteMany({where:{id:userId}});await db.$disconnect();}
}

test('concurrentSameKeySendsOnce',async()=>fixture(async({db,ctx,execute,input}:any)=>{
  let calls=0;const send=async()=>{calls++;return{status:'sent',providerId:'m1'};};
  const results=await Promise.all([execute(ctx,input,send),execute(ctx,input,send)]);
  assert.equal(calls,1);assert.ok(results.some(r=>r.status==='sent'));
  assert.deepEqual(await execute(ctx,input,send),{status:'sent',providerId:'m1'});assert.equal(calls,1);
  assert.equal(JSON.stringify(await db.facebookInteractionSendAttempt.findMany({where:{managedPageId:ctx.managedPageId}})).includes(input.text),false);
}));

test('revocationAfterFacebookDispatchKeepsConsumedAttemptUnknown',async()=>fixture(async({db,ctx,execute,input}:any)=>{
  const result=await execute(ctx,input,async()=>{
    const page=await db.facebookManagedPage.findUniqueOrThrow({where:{id:ctx.managedPageId}});
    await db.facebookManagementConnection.update({where:{id:page.connectionId},data:{status:'disconnected',version:{increment:1},userTokenEncrypted:null}});
    return{status:'sent',providerId:'sent-before-revocation'};
  });
  assert.equal(result.status,'unknown');
  const stored=await db.facebookInteractionSendAttempt.findFirstOrThrow({where:{managedPageId:ctx.managedPageId,requestKey:input.requestKey}});
  assert.equal(stored.status,'unknown');assert.equal(stored.providerId,null);
}));

test('sameKeyDifferentTextOrTargetRejected',async()=>fixture(async({ctx,execute,input}:any)=>{
  let calls=0;const send=async()=>{calls++;return{status:'sent',providerId:'m2'};};
  await execute(ctx,input,send);
  for(const altered of [{...input,text:'Different'},{...input,targetId:'301'},{...input,kind:'comment'}])await assert.rejects(execute(ctx,altered,send));
  await assert.rejects(execute({...ctx,workspaceId:randomUUID()},input,send));
  await assert.rejects(execute(ctx,{...input,requestKey:'not-uuid'},send));assert.equal(calls,1);
}));

test('providerSuccessBeforeConnectionLossBecomesUnknownWithoutRetry',async()=>fixture(async({ctx,execute,input}:any)=>{
  let calls=0;const send=async()=>{calls++;throw Error('private token and customer text');};
  const result=await execute(ctx,input,send);assert.equal(result.status,'unknown');
  assert.deepEqual(await execute(ctx,input,send),result);assert.equal(calls,1);
  assert.equal(JSON.stringify(result).includes('customer'),false);
}));

test('abandonedPendingAttemptBecomesUnknown',async()=>fixture(async({db,ctx,execute,input}:any)=>{
  let calls=0,release!:()=>void,started!:(v:boolean)=>void;
  const ready=new Promise<boolean>(resolve=>{started=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
  const send=async()=>{calls++;started(true);await held;return{status:'sent',providerId:'late'};};
  const first=execute(ctx,input,send);
  try{
    assert.equal(await Promise.race([ready,first.then(()=>false)]),true);
    const pending=await execute(ctx,input,async()=>{throw Error('must never resend');});assert.equal(pending.status,'unknown');
    await db.facebookInteractionSendAttempt.updateMany({where:{managedPageId:ctx.managedPageId,requestKey:input.requestKey},data:{createdAt:new Date(Date.now()-31000)}});
    const abandoned=await execute(ctx,input,send);assert.equal(abandoned.status,'unknown');
    release();assert.equal((await first).status,'unknown');
    assert.deepEqual(await execute(ctx,input,send),abandoned);assert.equal(calls,1);
  }finally{release();await first;}
}));
