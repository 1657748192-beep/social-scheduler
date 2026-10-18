import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture,type MetaInboxFixture} from './helpers/metaInboxFixture';
import * as retention from '../src/interactionInbox/retention';
import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';
const now=new Date('2026-10-18T12:00:00Z'),day=86400000;
const asset=(f:MetaInboxFixture)=>({workspaceId:f.adminCtx.workspaceId,platform:'instagram' as const,appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1});
const policy=(f:MetaInboxFixture,raw=1,content=3)=>createLiveInboxPolicy([{...asset(f),readEnabled:false,sendEnabled:false,policy:{product:'synthetic-test-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:raw,contentRetentionDays:content,replyWindowMs:1000,reviewed:true}}].map(({connectionId,connectionVersion,...r})=>r),()=>now);
async function seed(f:MetaInboxFixture,kind:'raw'|'message'|'comment',id:string,at:Date,patch:any={}){
 const base={workspaceId:f.adminCtx.workspaceId,connectionId:f.instagramConnectionIds[0],connectionVersion:1,receivedAt:at};
 if(kind==='raw')return f.db.instagramInteractionEvent.create({data:{...base,eventKey:id,payload:{synthetic:id},...patch}});
 if(kind==='message')return f.db.instagramInteractionMessage.create({data:{...base,providerId:id,conversationId:'synthetic-thread',actorId:'300',inbound:true,text:'Synthetic body',occurredAt:at,...patch}});
 return f.db.instagramInteractionComment.create({data:{...base,providerId:id,mediaId:'synthetic-media',actorId:'300',text:'Synthetic comment',occurredAt:at,...patch}});
}
function service(f:MetaInboxFixture,p=policy(f)){
 assert.equal(typeof (retention as any).createMetaSourceRetention,'function','bounded Meta source retention required');
 return (retention as any).createMetaSourceRetention({db:f.db,policy:p});
}
test('expiredRawAndBodyPurgedInBoundedBatches',async()=>withMetaInboxFixture(async f=>{
 const before=await f.publishingSnapshot(),s=service(f);
 for(const kind of ['raw','message','comment'] as const)for(let i=0;i<3;i++)await seed(f,kind,kind+i,new Date(now.getTime()-4*day));
 let total=0;for(let i=0;i<10;i++){const n=await s.pruneInstagram(asset(f),now,2);assert.ok(n>=0&&n<=2);total+=n;if(!n)break;}
 assert.equal(total,9);assert.equal(await f.db.instagramInteractionEvent.count({where:{connectionId:f.instagramConnectionIds[0]}}),0);assert.deepEqual(await f.publishingSnapshot(),before);
 await assert.rejects(s.pruneInstagram(asset(f),now,51));await assert.rejects(s.pruneInstagram(asset(f),new Date('invalid'),1));
}));
test('rawSevenDaysContentNinetyDaysAreCapsNotEntitlements',async()=>withMetaInboxFixture(async f=>{
 const s=service(f),a=asset(f);
 for(const kind of ['raw','message','comment'] as const){const age=kind==='raw'?day:3*day;
  for(const [id,delta] of [['older',-1],['boundary',0],['newer',1]] as const)await seed(f,kind,kind+'-'+id,new Date(now.getTime()-age+delta));
 }
 assert.equal(await s.pruneInstagram(a,now,50),3);
 assert.deepEqual((await f.db.instagramInteractionEvent.findMany({where:{connectionId:a.connectionId},orderBy:{eventKey:'asc'}})).map(v=>v.eventKey),['raw-boundary','raw-newer']);
 for(const model of [f.db.instagramInteractionMessage,f.db.instagramInteractionComment] as any[])assert.equal(await model.count({where:{connectionId:a.connectionId}}),2);
 assert.throws(()=>policy(f).requireAsset(a,'read'),(e:any)=>e.statusCode===409,'cleanup must not enable a disabled live asset');
}));
test('missingRuleStillEnforcesProductCapsWithoutEnablingPersistence',async()=>withMetaInboxFixture(async f=>{
 const p=createLiveInboxPolicy([],()=>now),s=service(f,p),a=asset(f);
 for(const kind of ['raw','message','comment'] as const){const age=(kind==='raw'?7:90)*day;await seed(f,kind,kind+'-expired',new Date(now.getTime()-age-1));await seed(f,kind,kind+'-boundary',new Date(now.getTime()-age));}
 assert.equal(await s.pruneInstagram(a,now,50),3);assert.throws(()=>p.requireAsset(a,'read'));
}));
test('retentionPreservesOtherNamespacesAndNewerEpochAndCannotRefreshOldBodyAge',async()=>withMetaInboxFixture(async f=>{
 const s=service(f),a=asset(f),old=new Date(now.getTime()-4*day),before=await f.publishingSnapshot();
 await seed(f,'message','old-body-new-receipt',now,{occurredAt:old});
 const newer=await seed(f,'message','new-epoch',old,{connectionVersion:2});
 const foreign=await seed(f,'message','foreign',old,{workspaceId:f.foreignCtx.workspaceId,connectionId:f.instagramConnectionIds[1]});
 assert.equal(await s.pruneInstagram(a,now,50),1);assert.ok(await f.db.instagramInteractionMessage.findUnique({where:{id:newer.id}}));assert.ok(await f.db.instagramInteractionMessage.findUnique({where:{id:foreign.id}}));
 for(const patch of [{appId:'999'},{providerAssetId:'999'},{workspaceId:f.foreignCtx.workspaceId},{platform:'facebook'}])await assert.rejects(s.pruneInstagram({...a,...patch},now,50));
 assert.deepEqual(await f.publishingSnapshot(),before);
}));
