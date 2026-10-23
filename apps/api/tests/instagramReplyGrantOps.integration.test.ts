import test from 'node:test';import assert from 'node:assert/strict';import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {seedRec3Fixture,cleanRec3Fixture} from './helpers/instagramReplyGrantFixture';
import {execFileSync} from 'node:child_process';
test('REC3 CLI defaults load no runtime and explicitly report zero requests or writes',()=>{
 for(const mode of ['read','prepare','verify'])assert.deepEqual(JSON.parse(execFileSync(process.execPath,['scripts/ops/instagram-rec3/'+mode+'.cjs'],{encoding:'utf8'})),{dryRun:true,requests:0,writes:0});
});
async function fixture(f:any,mode='ok'){
 const m=await import('../src/instagramManagement/recordingGrantOps').catch(()=>null);assert.ok(m?.createInstagramRec3Ops,'controlled REC3 operations required');const s=await seedRec3Fixture(f);let calls=0;
 const fetchImpl=async(input:any,options:any)=>{calls++;assert.equal(options.method,'GET');assert.equal(options.redirect,'error');const u=new URL(String(input));assert.equal(u.hostname,'graph.instagram.com');
  if(mode==='limited')return new Response('{}',{status:429});
  if(u.pathname.endsWith('/me'))return Response.json({id:'100',username:'mooyamcosmetic'});
  if(u.pathname.endsWith('/conversations'))return Response.json({data:[{id:s.rec3.conversationId,participants:{data:[{id:'100'},{id:'300'}]}}],...(mode==='broken-conversations'?{paging:{next:'https://graph.instagram.com/next'}}:{})});
  assert.ok(u.pathname.endsWith('/thread-rec3'));
  const raw={id:s.rec3.providerId,message:s.rec3.text,created_time:s.rec3.occurredAt.toISOString(),from:{id:'300',username:'synthetic'},to:{data:[{id:'100'}]}};
  return Response.json(mode==='broken-messages'?{messages:{data:[raw],paging:{next:'https://graph.instagram.com/next'}}}:{data:mode==='duplicate'?[raw,{...raw,id:'duplicate'}]:[raw],...(mode==='endless'?{paging:{next:'https://graph.instagram.com/ignored',cursors:{after:'next'}}}:{})});
 };
 const ops=m.createInstagramRec3Ops({db:f.db,ctx:f.adminCtx,rule:s.rule,policy:s.policy,graphVersion:'v25.0',decrypt:(v:string)=>v,evidenceKey:'synthetic-evidence-key-long-enough',fetchImpl:fetchImpl as typeof fetch,isDeleted:async()=>false,now:()=>s.now});return Object.assign(s,{ops,calls:()=>calls});
}
test('REC3 operations default to zero requests and writes; signed read prepares exactly one source without any send',async()=>withMetaInboxFixture(async f=>{try{
 const s=await fixture(f),before=await s.oldSnapshot();assert.equal((await s.ops.read()).dryRun,true);assert.equal((await s.ops.prepare()).dryRun,true);assert.equal(s.calls(),0);assert.equal(await f.db.instagramReplyRecordingGrant.count({where:{workspaceId:s.rule.workspaceId}}),0);
 const evidence=await s.ops.read({allowProviderRead:true});assert.equal(s.calls(),3);assert.equal(evidence.complete,true);assert.equal(await f.db.instagramReplyRecordingGrant.count({where:{workspaceId:s.rule.workspaceId}}),0);
 const ready=await s.ops.prepare({apply:true,evidence});assert.equal(ready.ready,true);assert.equal(s.calls(),3);assert.equal((await s.ops.verify()).unused,true);assert.deepEqual(await s.oldSnapshot(),before);
 const repeated=await s.ops.prepare({apply:true,evidence});assert.equal(repeated.ready,true);assert.equal(await f.db.instagramReplyRecordingGrant.count({where:{workspaceId:s.rule.workspaceId}}),1);
 await assert.rejects(s.ops.prepare({apply:true,evidence:{...evidence,readAt:'2000-01-01T00:00:00Z'}}));
}finally{await cleanRec3Fixture(f);}}));
test('REC3 read rejects an ineligible authorizer before any provider request',async()=>withMetaInboxFixture(async f=>{try{
 const s=await fixture(f);await f.db.instagramManagementConnection.update({where:{id:s.rule.connectionId},data:{userId:f.viewerCtx.userId}});await assert.rejects(s.ops.read({allowProviderRead:true}));assert.equal(s.calls(),0);
}finally{await cleanRec3Fixture(f);}}));
test('REC3 repeated preparation cannot report an expired unused grant ready',async()=>withMetaInboxFixture(async f=>{try{
 const s=await fixture(f),evidence=await s.ops.read({allowProviderRead:true});await s.ops.prepare({apply:true,evidence});s.now=new Date(+s.now+61000);const fresh=await s.ops.read({allowProviderRead:true});await assert.rejects(s.ops.prepare({apply:true,evidence:fresh}));
}finally{await cleanRec3Fixture(f);}}));
for(const mode of ['limited','duplicate','endless','broken-conversations','broken-messages'])test('REC3 controlled read stops on '+mode+' without synchronization or qualification',async()=>withMetaInboxFixture(async f=>{try{
 const s=await fixture(f,mode);await assert.rejects(s.ops.read({allowProviderRead:true}));assert.ok(s.calls()<=10);if(mode==='limited')assert.equal(s.calls(),1);assert.equal(await f.db.instagramReplyRecordingGrant.count({where:{workspaceId:s.rule.workspaceId}}),0);
}finally{await cleanRec3Fixture(f);}}));

for(const failure of ['changed','throws'])test('REC3 failed final protected snapshot leaves no claimable qualification: '+failure,async()=>withMetaInboxFixture(async f=>{try{
 const s=await fixture(f),evidence=await s.ops.read({allowProviderRead:true});
 const original=f.db.$transaction.bind(f.db);let snapshots=0;
 (f.db as any).$transaction=async(callback:any,options:any)=>{
  if(options?.isolationLevel==='Serializable')return original(async(tx:any)=>{
   const delegate=tx.socialAccount,findMany=delegate.findMany.bind(delegate);
   delegate.findMany=async(...args:any[])=>{
    if(failure==='throws')throw Error('synthetic final snapshot failure');
    const rows=await findMany(...args);return rows.map((v:any)=>({...v,displayName:'concurrent protected change'}));
   };
   return callback(tx);
  },options);
  if(options?.isolationLevel==='RepeatableRead'&&++snapshots===3){
   if(failure==='throws')throw Error('synthetic final snapshot failure');
   await f.db.socialAccount.update({where:{id:s.rule.accountId},data:{displayName:'concurrent protected change'}});
  }
  return original(callback,options);
 };
 try{await assert.rejects(s.ops.prepare({apply:true,evidence}));}finally{(f.db as any).$transaction=original;}
 assert.equal(await f.db.instagramReplyRecordingGrant.count({where:{workspaceId:s.rule.workspaceId,state:'available'}}),0);
 const {createInstagramRecordingGrants}=await import('../src/instagramManagement/recordingGrants');
 const grants=createInstagramRecordingGrants({db:f.db,rule:s.rule,policy:s.policy,now:()=>s.now,isDeleted:async()=>false});
 await assert.rejects(grants.claim(s.input()));
}finally{await cleanRec3Fixture(f);}}));
