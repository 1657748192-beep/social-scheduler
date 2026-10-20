import assert from 'node:assert/strict';
import test from 'node:test';

let setupPromise:Promise<any>|undefined;
function setup(){return setupPromise??=(async()=>{
 const env=require('../../../scripts/run-tests.cjs').environment(true,true);
 assert.notEqual(env.FACEBOOK_TEST_DATABASE_URL,process.env.DATABASE_URL);
 const previousDatabase=process.env.DATABASE_URL;
 process.env.DATABASE_URL=env.FACEBOOK_TEST_DATABASE_URL;
 process.env.REDIS_URL=env.LOCAL_UPLOAD_TEST_REDIS_URL;
 process.env.FACEBOOK_CLIENT_ID='123';process.env.FACEBOOK_CLIENT_SECRET='synthetic-secret';
 process.env.FACEBOOK_LOGIN_CONFIG_ID='1748083276619458';
 process.env.FACEBOOK_PAGE_IMPORT_LOGIN_CONFIG_ID='1659564855841697';
 const {config}=await import('../src/config');
 const {createPageImportRuntime}=await import('../src/facebookPageImportInvitations/runtime');
 const {prisma}=await import('../src/prisma');const {redis}=await import('../src/redis');
 await prisma.$connect();process.env.DATABASE_URL=previousDatabase;
 const {withPageImportFixture}=await import('./helpers/facebookPageImportInvitationsFixture');
 return{config,createPageImportRuntime,prisma,redis,withPageImportFixture};
})();}
test.after(async()=>{if(setupPromise){const {prisma,redis}=await setupPromise;redis.disconnect();await prisma.$disconnect();}});

test('environment schema retains the dedicated Page import login configuration',async()=>{
 const {config}=await setup();assert.equal(config.FACEBOOK_PAGE_IMPORT_LOGIN_CONFIG_ID,'1659564855841697');
});
test('real invitation runtime uses only the dedicated config while ordinary sync keeps publishing config',async()=>{
 const {config,createPageImportRuntime,withPageImportFixture}=await setup();
 await withPageImportFixture(async(f:any)=>{
  const runtime=createPageImportRuntime(),before=await f.snapshot();
  const created=await runtime.service.create(f.ctx,{note:'Local config isolation'});
  const flow=await runtime.oauth.beginPublicFlow(created.secret);
  const params=new URL(flow.authorizationUrl).searchParams;
  try{
   assert.equal(params.get('config_id'),'1659564855841697');assert.equal(params.has('scope'),false);
   assert.equal(params.get('client_id'),'123');assert.match(params.get('state')!,/^fbpi_/);
  }finally{await runtime.flows.release(await runtime.flows.consume(params.get('state')!,flow.cookie.value));}
  const {getFacebookPageSyncRuntime}=await import('../src/facebookPageSync/runtime');
  const ordinary=getFacebookPageSyncRuntime(),started=await ordinary.start(f.ctx);
  const oldParams=new URL(started.authorizationUrl).searchParams;
  assert.equal(oldParams.get('config_id'),'1748083276619458');
  await assert.rejects(ordinary.callback({state:oldParams.get('state')!,error:'access_denied'}));
  assert.equal(config.FACEBOOK_LOGIN_CONFIG_ID,'1748083276619458');assert.deepEqual(await f.snapshot(),before);
 });
});
test('missing or invalid import config fails closed without using publishing config or default scopes',async()=>{
 const {config,createPageImportRuntime}=await setup();const saved=config.FACEBOOK_PAGE_IMPORT_LOGIN_CONFIG_ID;
 try{for(const value of ['', ' ', 'not-a-config']){
  config.FACEBOOK_PAGE_IMPORT_LOGIN_CONFIG_ID=value;
  assert.throws(()=>createPageImportRuntime(),(error:any)=>error.statusCode===503);
  assert.equal(config.FACEBOOK_LOGIN_CONFIG_ID,'1748083276619458');
 }}finally{config.FACEBOOK_PAGE_IMPORT_LOGIN_CONFIG_ID=saved;}
});
