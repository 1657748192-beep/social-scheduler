import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
import {startFacebookManagementHttp} from './helpers/facebookManagementHttp';

test('published HTTP response preserves stored Facebook post identity without changing publishing data',async()=>withFacebookManagementFixture(async(f:any)=>{
  const {db}=f,workspaceId=f.workspaceIds[0];
  const instagram=await db.socialAccount.create({data:{workspaceId,platform:'instagram',providerAccountId:'ig-test',displayName:'Instagram',credential:{create:{accessTokenEncrypted:'untouched-ig-token',scopes:['instagram_business_basic']}}}});
  const cases=[
    {name:'facebook',platform:'facebook',accountId:f.accounts[0].id,providerId:'100_9'},
    {name:'detached',platform:'facebook',accountId:null,providerId:'100_8'},
    {name:'missing',platform:'facebook',accountId:f.accounts[0].id,providerId:null},
    {name:'instagram',platform:'instagram',accountId:instagram.id,providerId:'ig-media-7'},
    {name:'youtube',platform:'youtube',accountId:null,providerId:'youtube-video-7'}
  ];
  const ids:Record<string,string>={};
  for(const row of cases){
    const post=await db.post.create({data:{workspaceId,authorId:f.userId,baseText:row.name,variants:{create:{platform:row.platform,socialAccountId:row.accountId,text:row.name,publishStatus:'published'}}},include:{variants:true}});
    const schedule=await db.schedule.create({data:{workspaceId,postVariantId:post.variants[0].id,createdBy:f.userId,scheduledAt:new Date('2026-10-16T08:00:00Z'),status:'published'}});
    await db.publishJob.create({data:{workspaceId,postVariantId:post.variants[0].id,scheduleId:schedule.id,status:'succeeded',idempotencyKey:randomUUID(),providerPostId:row.providerId,rawResponse:{testOnly:true}}});
    ids[row.name]=schedule.id;
  }
  const snapshot=async()=>({accounts:await f.snapshot(),posts:await db.post.findMany({where:{workspaceId},include:{variants:true},orderBy:{id:'asc'}}),schedules:await db.schedule.findMany({where:{workspaceId},include:{publishJobs:{orderBy:{id:'asc'}}},orderBy:{id:'asc'}})});
  const before=await snapshot(),http=await startFacebookManagementHttp();
  try{
    const session=await db.userSession.findUniqueOrThrow({where:{id:f.sessionId}});
    const token=jwt.sign({sub:f.userId,email:`${f.userId}@example.test`,sid:f.sessionId,jti:session.tokenId},'facebook-management-http-test-only');
    const response=await fetch(`${http.origin}/api/v1/workspaces/${workspaceId}/published-posts`,{headers:{authorization:`Bearer ${token}`}});
    assert.equal(response.status,200);
    const rows=await response.json() as Array<{id:string;providerPostId:string|null;socialAccount:{id:string}|null}>;
    const find=(name:string)=>rows.find(row=>row.id===ids[name])!;
    assert.equal(find('facebook').providerPostId,'100_9');
    assert.equal(find('facebook').socialAccount?.id,f.accounts[0].id);
    assert.equal(find('detached').providerPostId,'100_8');
    assert.equal(find('detached').socialAccount,null,'Exposing an ID must not restore a binding');
    assert.equal(find('missing').providerPostId,null,'Do not manufacture missing provider IDs');
    assert.equal(find('instagram').providerPostId,'ig-media-7');
    assert.equal(find('youtube').providerPostId,null,'Other platform response behavior stays unchanged');
    assert.deepEqual(await snapshot(),before,'Listing posts must not modify publishing data');
  }finally{await http.stop();}
}));
