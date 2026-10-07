import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createFacebookReceptionStore } from '../src/services/facebookReceptionStore';
import type { FacebookReceivedEventInput } from '../src/services/facebookWebhookService';
import {createFacebookEngagementService} from '../src/services/facebookEngagementService';

test('Facebook durable reception isolates accounts, orders comments and recovers leases',async t=>{
  const url=process.env.FACEBOOK_TEST_DATABASE_URL;if(!url){t.skip('Independent FACEBOOK_TEST_DATABASE_URL required');return;}
  assert.match(new URL(url).pathname,/_test$/);assert.notEqual(url,process.env.DATABASE_URL);
  const db=new PrismaClient({datasources:{db:{url}}}),userId=randomUUID(),workspaceId=randomUUID(),secondWorkspaceId=randomUUID(),accountId=randomUUID(),secondAccountId=randomUUID();
  const store=createFacebookReceptionStore(db),now=new Date();
  const event:FacebookReceivedEventInput={pageId:'100',eventKey:'comment-add',kind:'comment',providerId:'c1',postId:'100_1',text:'hello',occurredAt:now.toISOString(),deleted:false};
  async function drain(){for(const row of await store.claimBatch(new Date(),50)){await store.processClaim(row,new Date());await store.finishClaim(row.id,row.claimToken);}}
  try{
    await db.user.create({data:{id:userId,email:`${userId}@example.test`,passwordHash:'not-a-password',name:'Test'}});
    for(const [id,account] of [[workspaceId,accountId],[secondWorkspaceId,secondAccountId]]){
      await db.workspace.create({data:{id,ownerId:userId,name:'Test',slug:id}});
      await db.socialAccount.create({data:{id:account,workspaceId:id,platform:'facebook',providerAccountId:'100',accountType:'page',displayName:'Test'}});
    }
    await Promise.all([store.enqueue([event]),store.enqueue([event])]);await drain();
    assert.equal(await db.facebookReceivedComment.count(),2);
    const deletion={...event,eventKey:'delete',deleted:true,text:undefined,occurredAt:new Date(now.getTime()+1).toISOString()};
    await store.enqueue([deletion]);await drain();await store.enqueue([{...event,eventKey:'stale-edit',text:'stale'}]);await drain();
    assert.ok((await db.facebookReceivedComment.findMany()).every(row=>row.deleted && row.text===null));
    const service=createFacebookEngagementService({enabled:()=>true,apiVersion:'v20.0',requireMembership:async()=>({role:'owner'}),now:()=>now,decrypt:value=>value,
      getAccount:async()=>({id:accountId,workspaceId,platform:'facebook',accountType:'page',status:'active',providerAccountId:'100',credential:{accessTokenEncrypted:'fake',scopes:[]}}),
      getPost:async()=>({id:'schedule',workspaceId,status:'published',postVariant:{platform:'facebook',socialAccountId:accountId},publishJobs:[{status:'succeeded',providerPostId:'100_1'}]}),
      listReceivedComments:(account,post)=>store.listReceivedComments(account,post),
      createClient:()=>({inspectCapabilities:async()=>({readComments:{status:'available'}}),listComments:async()=>({items:[{id:'c1',postId:'100_1',text:'stale Graph',timestamp:now.toISOString()}],nextCursor:null})}) as any});
    assert.deepEqual((await service.listComments({userId,workspaceId,socialAccountId:accountId},'schedule')).items,[]);
    const message:FacebookReceivedEventInput={pageId:'100',eventKey:'message',kind:'message',providerId:'m1',senderId:'customer',recipientId:'100',text:'hi',occurredAt:now.toISOString(),isEcho:false};
    await store.enqueue([message]);const claimTime=new Date();const first=await store.claimBatch(claimTime,50);assert.equal(first.length,2);
    const reclaimed=await store.claimBatch(new Date(claimTime.getTime()+61000),50);assert.equal(reclaimed.length,2);
    assert.equal(await store.finishClaim(first[0].id,first[0].claimToken),false);
    for(const row of reclaimed){await store.processClaim(row,new Date(now.getTime()+61000));await store.finishClaim(row.id,row.claimToken);}
    assert.equal(await db.facebookReceivedMessage.count(),2);assert.equal((await store.latestInbound(accountId,'customer'))?.toISOString(),now.toISOString());
    await db.socialAccount.delete({where:{id:accountId}});await store.enqueue([{...message,eventKey:'late',providerId:'m2'}]);await drain();
    assert.equal(await db.facebookReceivedThread.count({where:{socialAccountId:accountId}}),0);
    assert.equal(await db.facebookReceivedThread.count({where:{socialAccountId:secondAccountId}}),1);
    await store.enqueue([{...message,eventKey:'echo',providerId:'echo',senderId:'100',recipientId:'customer',isEcho:true,occurredAt:new Date(now.getTime()+1000).toISOString()}]);await drain();
    assert.equal((await store.latestInbound(secondAccountId,'customer'))?.toISOString(),now.toISOString());
    await store.enqueue([{...message,eventKey:'crashed',providerId:'crashed'}]);
    await db.facebookReceivedEvent.updateMany({where:{eventKey:'crashed'},data:{status:'processing',attempts:5,leaseUntil:new Date(0)}});
    await store.claimBatch(new Date(),50);
    assert.equal((await db.facebookReceivedEvent.findFirstOrThrow({where:{eventKey:'crashed'}})).status,'failed');
    await store.cleanup(new Date(now.getTime()+91*86400000));assert.equal(await db.facebookReceivedMessage.count(),0);assert.equal(await db.facebookReceivedComment.count(),0);
  }finally{await db.user.deleteMany({where:{id:userId}});await db.$disconnect();}
});
