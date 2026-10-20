import assert from 'node:assert/strict';
import test from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {withPageImportFixture} from './helpers/facebookPageImportInvitationsFixture';
import {createInvitationRepository} from '../src/facebookPageImportInvitations/repository';
import {retireFacebookManagementAuthorizer} from '../src/facebookManagement/store';

function barrier(){let open!:()=>void;const promise=new Promise<void>(r=>{open=r;});return{promise,open};}
async function blockedOrFinished(db:any,pid:()=>number|undefined,finished:()=>boolean){
 const deadline=Date.now()+3000;
 while(Date.now()<deadline){if(finished())return;const id=pid();if(id){const rows=await db.$queryRaw`SELECT wait_event_type FROM pg_stat_activity WHERE pid=${id}`;if(rows[0]?.wait_event_type==='Lock')return;}await delay(10);}
 throw Error('Concurrent admission did not reach its database barrier');
}
function pauseBeforeInsert(db:any,entered:ReturnType<typeof barrier>,release:ReturnType<typeof barrier>){
 return new Proxy(db,{get(target,key){if(key==='$transaction')return (fn:any)=>target.$transaction((tx:any)=>fn(new Proxy(tx,{get(t,k){if(k==='facebookPageImportInvitation')return new Proxy(t[k],{get(model,method){if(method==='create')return async(input:any)=>{entered.open();await release.promise;return model.create(input);};return Reflect.get(model,method);}});return Reflect.get(t,k);}})),{timeout:15000});return Reflect.get(target,key);}});
}
for(const mode of ['demotion','removal'] as const){
 test(`creation committing first cannot escape ${mode} retirement after re-promotion`,()=>withPageImportFixture(async f=>{
  const entered=barrier(),release=barrier(),before=await f.snapshot();let pid:number|undefined,finished=false;
  const repo=createInvitationRepository({...f,db:pauseBeforeInsert(f.db,entered,release),appId:'123'});
  const creating=repo.createInvitation(f.ctx,'racing invitation');await entered.promise;
  const retiring=f.db.$transaction(async(tx:any)=>{pid=(await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid;
   await tx.$queryRaw`SELECT id FROM workspace_members WHERE user_id=${f.userId}::uuid AND workspace_id=${f.ctx.workspaceId}::uuid FOR UPDATE`;
   await retireFacebookManagementAuthorizer(tx,f.ctx.workspaceId,f.userId);
   if(mode==='removal')await tx.workspaceMember.deleteMany({where:{workspaceId:f.ctx.workspaceId,userId:f.userId}});
   else await tx.workspaceMember.updateMany({where:{workspaceId:f.ctx.workspaceId,userId:f.userId},data:{role:'viewer'}});
  },{timeout:15000}).finally(()=>{finished=true;});
  try{await blockedOrFinished(f.db,()=>pid,()=>finished);}finally{release.open();}
  const created=await creating;await retiring;
  await f.db.workspaceMember.upsert({where:{workspaceId_userId:{workspaceId:f.ctx.workspaceId,userId:f.userId}},create:{workspaceId:f.ctx.workspaceId,userId:f.userId,role:'admin',status:'active'},update:{role:'admin',status:'active'}});
  assert.equal((await repo.readPrivate(f.ctx,created.view.id)).status,'revoked');
  // Retirement intentionally changes independent-management state; publishing stays untouched.
  const after=await f.snapshot();assert.deepEqual(after.accounts,before.accounts);assert.deepEqual(after.posts,before.posts);assert.deepEqual(after.schedules,before.schedules);
 }));
 test(`${mode} committing first rejects an already in-flight invitation creation`,()=>withPageImportFixture(async f=>{
  const locked=barrier(),release=barrier();let pid:number|undefined,finished=false;
  const retiring=f.db.$transaction(async(tx:any)=>{
   await tx.$queryRaw`SELECT id FROM workspace_members WHERE user_id=${f.userId}::uuid AND workspace_id=${f.ctx.workspaceId}::uuid FOR UPDATE`;
   await retireFacebookManagementAuthorizer(tx,f.ctx.workspaceId,f.userId);
   if(mode==='removal')await tx.workspaceMember.deleteMany({where:{workspaceId:f.ctx.workspaceId,userId:f.userId}});
   else await tx.workspaceMember.updateMany({where:{workspaceId:f.ctx.workspaceId,userId:f.userId},data:{role:'viewer'}});
   locked.open();await release.promise;
  },{timeout:15000});await locked.promise;
  const db=new Proxy(f.db,{get(target,key){if(key==='$transaction')return (fn:any)=>target.$transaction(async(tx:any)=>{pid=(await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid;return fn(tx);},{timeout:15000});return Reflect.get(target,key);}});
  const outcome=createInvitationRepository({...f,db,appId:'123'}).createInvitation(f.ctx,'').then(()=>false,()=>true).finally(()=>{finished=true;});
  try{await blockedOrFinished(f.db,()=>pid,()=>finished);}finally{release.open();}
  await retiring;assert.equal(await outcome,true);assert.equal(await f.db.facebookPageImportInvitation.count({where:{createdById:f.userId}}),0);
 }));
}
test('session revocation cannot pass an admitted creation before its insert commits',()=>withPageImportFixture(async f=>{
 const entered=barrier(),release=barrier();let pid:number|undefined,finished=false;
 const repo=createInvitationRepository({...f,db:pauseBeforeInsert(f.db,entered,release),appId:'123'});
 const creating=repo.createInvitation(f.ctx,'');await entered.promise;
 const revoking=f.db.$transaction(async(tx:any)=>{pid=(await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid;await tx.userSession.update({where:{id:f.ctx.sessionId},data:{revokedAt:new Date()}});}).finally(()=>{finished=true;});
 try{await blockedOrFinished(f.db,()=>pid,()=>finished);assert.equal(finished,false);}finally{release.open();await creating;await revoking;}
}));
test('session revocation committing first rejects an in-flight creation',()=>withPageImportFixture(async f=>{
 const locked=barrier(),release=barrier();let pid:number|undefined,finished=false;
 const revoking=f.db.$transaction(async(tx:any)=>{await tx.userSession.update({where:{id:f.ctx.sessionId},data:{revokedAt:new Date()}});locked.open();await release.promise;},{timeout:15000});await locked.promise;
 const db=new Proxy(f.db,{get(target,key){if(key==='$transaction')return (fn:any)=>target.$transaction(async(tx:any)=>{pid=(await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid;return fn(tx);},{timeout:15000});return Reflect.get(target,key);}});
 const outcome=createInvitationRepository({...f,db,appId:'123'}).createInvitation(f.ctx,'').then(()=>false,()=>true).finally(()=>{finished=true;});
 try{await blockedOrFinished(f.db,()=>pid,()=>finished);}finally{release.open();}
 await revoking;assert.equal(await outcome,true);assert.equal(await f.db.facebookPageImportInvitation.count({where:{createdById:f.userId}}),0);
}));
