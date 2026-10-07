import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createFacebookSubscriptionCoordinator } from '../src/services/facebookSubscription';
import { createFacebookEngagementClient } from '../src/integrations/social/facebookEngagement';
test('Page subscription coordination unlinks locally and preserves other fields',async t=>{
  const url=process.env.FACEBOOK_TEST_DATABASE_URL;if(!url){t.skip('Independent FACEBOOK_TEST_DATABASE_URL required');return;}
  assert.match(new URL(url).pathname,/_test$/);assert.notEqual(url,process.env.DATABASE_URL);
  const db=new PrismaClient({datasources:{db:{url}}}),userId=randomUUID(),workspaceId=randomUUID(),secondWorkspaceId=randomUUID(),pageId='page'+randomUUID().replace(/-/g,'');
  let fields=['mention'],rejectWrite=false,writes=0;
  const coordinator=createFacebookSubscriptionCoordinator(db,value=>'enc:'+value,value=>value.replace(/^enc:/,''),(id,token)=>createFacebookEngagementClient({pageId:id,accessToken:token,apiVersion:'v20.0',appId:'app',appSecret:'secret',fetchImpl:(async(url,init)=>{
    const path=new URL(String(url)).pathname;
    if(path.endsWith('/debug_token'))return Response.json({data:{is_valid:true,type:'PAGE',app_id:'app',scopes:['pages_manage_metadata']}});
    if(path.endsWith('/me'))return Response.json({id:pageId});
    if(init?.method==='POST'){writes++;if(rejectWrite)return Response.json({error:{code:2}},{status:503});fields=new URLSearchParams(String(init.body)).get('subscribed_fields')!.split(',');return Response.json({success:true});}
    if(init?.method==='DELETE'){writes++;fields=[];return Response.json({success:true});}
    return Response.json({data:[{id:'app',subscribed_fields:fields}]});
  }) as typeof fetch}));
  try{
    await db.user.create({data:{id:userId,email:`${userId}@example.test`,passwordHash:'not-a-password',name:'Test'}});
    await db.workspace.create({data:{id:workspaceId,ownerId:userId,name:'Test',slug:workspaceId}});
    await db.workspace.create({data:{id:secondWorkspaceId,ownerId:userId,name:'Test',slug:secondWorkspaceId}});
    const account=await db.socialAccount.create({data:{workspaceId,platform:'facebook',accountType:'page',providerAccountId:pageId,displayName:'Test',credential:{create:{accessTokenEncrypted:'enc:token',scopes:['pages_manage_metadata']}}}});
    assert.equal((await coordinator.ensure(account.id)).status,'available');assert.deepEqual(fields,['mention','feed','messages']);
    const second=await db.socialAccount.create({data:{workspaceId:secondWorkspaceId,platform:'facebook',accountType:'page',providerAccountId:pageId,displayName:'Test',credential:{create:{accessTokenEncrypted:'enc:token',scopes:['pages_manage_metadata']}}}});
    const sharedWrites=writes;await coordinator.disconnect(account.id);assert.equal(writes,sharedWrites);assert.equal(await db.socialAccount.count({where:{id:account.id}}),0);
    rejectWrite=true;await coordinator.disconnect(second.id);assert.equal(await db.socialAccount.count({where:{id:second.id}}),0);
    const pending=await db.facebookPageSubscriptionState.findUniqueOrThrow({where:{pageId}});assert.equal(pending.pendingRelease,true);assert.equal(pending.releaseTokenEncrypted,'enc:token');
    const reconnected=await db.socialAccount.create({data:{workspaceId,platform:'facebook',accountType:'page',providerAccountId:pageId,displayName:'Test',credential:{create:{accessTokenEncrypted:'enc:new',scopes:['pages_manage_metadata']}}}});
    const before=writes;await coordinator.retryPending();assert.equal(writes,before);assert.equal((await db.facebookPageSubscriptionState.findUniqueOrThrow({where:{pageId}})).releaseTokenEncrypted,null);
    rejectWrite=false;await coordinator.disconnect(reconnected.id);assert.deepEqual(fields,['mention']);
  }finally{await db.user.deleteMany({where:{id:userId}});await db.facebookPageSubscriptionState.deleteMany({where:{pageId}});await db.$disconnect();}
});
