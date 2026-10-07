import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createFacebookOAuthStore } from '../src/services/facebookOAuthStore';
import { facebookTokenFingerprint } from '../src/services/facebookEngagementOAuth';

test('Facebook OAuth persistence consumes once and preserves concurrent credentials',async t=>{
  const url=process.env.FACEBOOK_TEST_DATABASE_URL;
  if(!url){t.skip('Independent FACEBOOK_TEST_DATABASE_URL required');return;}
  assert.match(new URL(url).pathname,/_test$/);assert.notEqual(url,process.env.DATABASE_URL);
  const db=new PrismaClient({datasources:{db:{url}}});
  const userId=randomUUID(),workspaceId=randomUUID(),accountId=randomUUID();
  const store=createFacebookOAuthStore(db,value=>`encrypted:${value}`);
  try {
    await db.user.create({data:{id:userId,email:`${userId}@example.test`,passwordHash:'not-a-password',name:'Tester'}});
    await db.workspace.create({data:{id:workspaceId,ownerId:userId,name:'Test',slug:workspaceId}});
    await db.workspaceMember.create({data:{userId,workspaceId,role:'owner',status:'active'}});
    await db.socialAccount.create({data:{id:accountId,workspaceId,platform:'facebook',providerAccountId:'100',displayName:'Test',accountType:'page',credential:{create:{accessTokenEncrypted:'old',scopes:['pages_manage_posts']}}}});
    const state={state:randomUUID(),userId,workspaceId,socialAccountId:accountId,pageId:'100',scopes:['pages_manage_posts'],expectedTokenHash:facebookTokenFingerprint('old'),redirectUri:'https://example.test/callback',expiresAt:new Date(Date.now()+600000)};
    await store.create(state);
    const results=await Promise.all([store.consume(state.state),store.consume(state.state)]);
    assert.equal(results.filter(Boolean).length,1);
    const grant={pageId:'100',pageToken:'new',scopes:['pages_manage_posts'],expiresAt:null};
    await db.oauthCredential.update({where:{socialAccountId:accountId},data:{accessTokenEncrypted:'rotated'}});
    assert.equal(await store.save({...state,grant}),false);
    assert.equal((await db.oauthCredential.findUniqueOrThrow({where:{socialAccountId:accountId}})).accessTokenEncrypted,'rotated');
    const next={...state,expectedTokenHash:facebookTokenFingerprint('rotated')};
    assert.equal(await store.save({...next,grant}),true);
    assert.equal((await db.oauthCredential.findUniqueOrThrow({where:{socialAccountId:accountId}})).accessTokenEncrypted,'encrypted:new');
    await db.workspaceMember.updateMany({where:{userId,workspaceId},data:{role:'viewer'}});
    assert.equal(await store.save({...next,expectedTokenHash:facebookTokenFingerprint('encrypted:new'),grant}),false);
    await db.socialAccount.delete({where:{id:accountId}});
    assert.equal(await store.save({...next,grant}),false);
  } finally {await db.user.deleteMany({where:{id:userId}});await db.$disconnect();}
});
