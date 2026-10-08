import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';

test('supplemental Facebook authorization never reuses the publishing login configuration',async t=>{
  const url=process.env.FACEBOOK_TEST_DATABASE_URL;
  if(!url){t.skip('Independent FACEBOOK_TEST_DATABASE_URL required');return;}
  assert.match(new URL(url).pathname,/_test$/);
  assert.notEqual(url,process.env.DATABASE_URL);
  process.env.DATABASE_URL=url;
  process.env.REDIS_URL??='redis://127.0.0.1:6379';
  process.env.JWT_SECRET??='local-test-only-secret-at-least-32-characters';
  process.env.FACEBOOK_CLIENT_ID='test-app';
  process.env.FACEBOOK_CLIENT_SECRET='test-secret';
  const {config}=await import('../src/config');
  const {prisma}=await import('../src/prisma');
  const {facebookEngagementAuthorizationService}=await import('../src/services/facebookEngagementAuthorization');
  const original={...config};
  const userId=randomUUID(),workspaceId=randomUUID(),accountId=randomUUID();
  try{
    Object.assign(config,{FACEBOOK_ENGAGEMENT_ENABLED:true,FACEBOOK_LOGIN_CONFIG_ID:'publish-config',FACEBOOK_ENGAGEMENT_LOGIN_CONFIG_ID:'interaction-config'});
    await prisma.user.create({data:{id:userId,email:`${userId}@example.test`,passwordHash:'not-a-password',name:'Tester'}});
    await prisma.workspace.create({data:{id:workspaceId,ownerId:userId,name:'Test',slug:workspaceId}});
    await prisma.workspaceMember.create({data:{userId,workspaceId,role:'owner',status:'active'}});
    await prisma.socialAccount.create({data:{id:accountId,workspaceId,platform:'facebook',providerAccountId:'100',displayName:'Test',accountType:'page',credential:{create:{accessTokenEncrypted:'fixture',scopes:['pages_manage_posts']}}}});
    const dedicated=await facebookEngagementAuthorizationService().start(userId,workspaceId,accountId);
    assert.equal(new URL(dedicated.authorizationUrl).searchParams.get('config_id'),'interaction-config');
    Object.assign(config,{FACEBOOK_ENGAGEMENT_LOGIN_CONFIG_ID:''});
    const fallback=await facebookEngagementAuthorizationService().start(userId,workspaceId,accountId);
    const params=new URL(fallback.authorizationUrl).searchParams;
    assert.equal(params.has('config_id'),false);
    assert.ok(params.get('scope')?.split(',').includes('pages_messaging'));
    assert.ok(params.get('scope')?.split(',').includes('pages_manage_posts'));
  }finally{
    Object.assign(config,original);
    await prisma.user.deleteMany({where:{id:userId}});
    await prisma.$disconnect();
  }
});
