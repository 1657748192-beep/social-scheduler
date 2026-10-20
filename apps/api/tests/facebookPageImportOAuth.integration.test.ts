import assert from 'node:assert/strict';import test from 'node:test';import Redis from 'ioredis';
import {withPageImportFixture,importTestPage} from './helpers/facebookPageImportInvitationsFixture';
import {createInvitationRepository} from '../src/facebookPageImportInvitations/repository';
async function fixture(run:(f:any)=>Promise<void>){const mod=await import('../src/facebookPageImportInvitations/oauth').catch(()=>null);assert.ok(mod,'invitation OAuth must exist');
 await withPageImportFixture(async f=>{const env=require('../../../scripts/run-tests.cjs').environment(true,true),redis=new Redis(env.LOCAL_UPLOAD_TEST_REDIS_URL);
 const {createInvitationFlows}=await import('../src/facebookPageImportInvitations/flows');const flows=createInvitationFlows(redis),repo=createInvitationRepository({...f,appId:'123'});
 const graph:any={authorizationUrl:(state:string)=>'https://www.facebook.com/v20.0/dialog/oauth?state='+state,discover:async()=>({providerUserId:'900',pages:['100','101','102'].map(importTestPage),rejected:[]})};
 const oauth=mod.createInvitationOAuth({...f,appId:'123',repo,flows,graph});try{await run({...f,repo,flows,graph,oauth});}finally{redis.disconnect();}});
}
test('external callback saves candidates but creates no publishing account or credential',()=>fixture(async f=>{
 const before=await f.snapshot(),invite=await f.repo.createInvitation(f.ctx,'Account B');const start=await f.oauth.beginPublicFlow(invite.secret);
 const state=new URL(start.authorizationUrl).searchParams.get('state');
 assert.equal(await f.oauth.completePublicFlow({state,code:'controlled-code',flowCookie:start.cookie.value}),'received');
 assert.deepEqual(await f.snapshot(),before);assert.equal(await f.db.socialAccount.count({where:{workspaceId:f.ctx.workspaceId,providerAccountId:'101'}}),0);
 const row=await f.repo.readPrivate(f.ctx,invite.view.id);assert.equal(row.status,'authorized_pending_selection');assert.equal((await f.repo.candidates(row)).pages.length,3);
 await assert.rejects(f.oauth.beginPublicFlow(invite.secret));
 assert.equal(await f.oauth.completePublicFlow({state,code:'controlled-code',flowCookie:start.cookie.value}),'unavailable');
}));
test('an authorized empty Page directory is saved without changing publishing data',()=>fixture(async f=>{
 const before=await f.snapshot(),invite=await f.repo.createInvitation(f.ctx,''),start=await f.oauth.beginPublicFlow(invite.secret);
 f.graph.discover=async()=>({providerUserId:'900',pages:[],rejected:[]});
 assert.equal(await f.oauth.completePublicFlow({state:new URL(start.authorizationUrl).searchParams.get('state'),code:'controlled',flowCookie:start.cookie.value}),'received');
 const row=await f.repo.readPrivate(f.ctx,invite.view.id);assert.equal(row.status,'authorized_pending_selection');assert.deepEqual((await f.repo.candidates(row)).pages,[]);assert.deepEqual(await f.snapshot(),before);
}));
test('directory failure is visible to the creator without exposing provider errors or changing publishing data',()=>fixture(async f=>{
 const before=await f.snapshot(),invite=await f.repo.createInvitation(f.ctx,''),start=await f.oauth.beginPublicFlow(invite.secret);
 f.graph.discover=async()=>{throw Error('secret-provider-payload');};
 assert.equal(await f.oauth.completePublicFlow({state:new URL(start.authorizationUrl).searchParams.get('state'),code:'controlled',flowCookie:start.cookie.value}),'unavailable');
 const row=await f.repo.readPrivate(f.ctx,invite.view.id);assert.equal(row.diagnosticId,'page_directory_read_failed');assert.equal(row.status,'awaiting_authorization');assert.deepEqual(await f.snapshot(),before);
 const {createFacebookPageImportInvitationService}=await import('../src/facebookPageImportInvitations/service');
 const service=createFacebookPageImportInvitationService({...f,appId:'123',repo:f.repo,graph:{revalidate:async p=>p}});
 assert.equal((await service.list(f.ctx)).items[0].authorizationOutcome,'read_failed');
 const retry=await f.oauth.beginPublicFlow(invite.secret);f.graph.discover=async()=>({providerUserId:'900',pages:[],rejected:[]});
 assert.equal(await f.oauth.completePublicFlow({state:new URL(retry.authorizationUrl).searchParams.get('state'),code:'controlled-retry',flowCookie:retry.cookie.value}),'received');
 assert.equal((await f.repo.readPrivate(f.ctx,invite.view.id)).diagnosticId,null);assert.equal((await service.list(f.ctx)).items[0].authorizationOutcome,'no_new_pages');assert.deepEqual(await f.snapshot(),before);
}));
test('creator removal or revocation while Graph waits prevents candidate save',()=>fixture(async f=>{
 for(const revoke of [false,true]){const invite=await f.repo.createInvitation(f.ctx,''),start=await f.oauth.beginPublicFlow(invite.secret);const state=new URL(start.authorizationUrl).searchParams.get('state');
 f.graph.discover=async()=>{if(revoke)await f.db.facebookPageImportInvitation.update({where:{id:invite.view.id},data:{status:'revoked',version:{increment:1}}});else await f.db.workspaceMember.update({where:{workspaceId_userId:{workspaceId:f.ctx.workspaceId,userId:f.userId}},data:{role:'viewer'}});return{providerUserId:'900',pages:[importTestPage('101')],rejected:[]};};
 assert.equal(await f.oauth.completePublicFlow({state,code:'controlled',flowCookie:start.cookie.value}),'unavailable');
 assert.equal(await f.db.facebookPageImportCandidate.count({where:{invitationId:invite.view.id}}),0);
 await f.db.workspaceMember.update({where:{workspaceId_userId:{workspaceId:f.ctx.workspaceId,userId:f.userId}},data:{role:'owner'}});await assert.rejects(f.oauth.beginPublicFlow(invite.secret));}
}));
test('cancellation and an expired browser flow do not consume an invitation forever',()=>fixture(async f=>{
 const invite=await f.repo.createInvitation(f.ctx,''),a=await f.oauth.beginPublicFlow(invite.secret);const state=new URL(a.authorizationUrl).searchParams.get('state');
 assert.equal(await f.oauth.completePublicFlow({state,error:'access_denied',flowCookie:a.cookie.value}),'unavailable');
 const b=await f.oauth.beginPublicFlow(invite.secret);assert.ok(b.authorizationUrl);await f.oauth.completePublicFlow({state:new URL(b.authorizationUrl).searchParams.get('state'),error:'cancel',flowCookie:b.cookie.value});
 assert.equal((await f.repo.readPrivate(f.ctx,invite.view.id)).status,'awaiting_authorization');
}));
