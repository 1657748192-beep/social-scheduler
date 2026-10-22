import test from 'node:test';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
import {withInboxFixture} from './helpers/interactionInboxFixture';import {presentInboxCase} from '../src/interactionInbox/cases';
import {createInboxReads} from '../src/interactionInbox/reads';import {inboxTestAccess,inboxTestPolicy} from './helpers/interactionInboxServices';

test('message replied badge requires an original successful current recipient receipt after inbound',async()=>withInboxFixture(async f=>{
 const c=await f.seedVerifiedCase(),base=Date.now()-120000;
 await f.db.interactionCase.update({where:{id:c.id},data:{lastInboundAt:new Date(base),status:'in_progress'}});
 const before=await f.protectedSnapshot(),targetHash=createHash('sha256').update(JSON.stringify(['message','300'])).digest('hex');
 const attempt=await f.db.facebookInteractionSendAttempt.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,requestKey:randomUUID(),targetHash,payloadHash:'synthetic',status:'unknown',createdAt:new Date(base+10000)}});
 const badge=async()=> (await presentInboxCase(f.db,f.adminCtx,c.id,f.accountIds[0])).replied;
 assert.equal(await badge(),false);
 for(const status of ['pending','failed','sent']){await f.db.facebookInteractionSendAttempt.update({where:{id:attempt.id},data:{status}});assert.equal(await badge(),false);}
 await f.db.facebookInteractionSendAttempt.update({where:{id:attempt.id},data:{status:'sent',providerId:'original-receipt'}});
 assert.equal(await badge(),true);
 await f.db.interactionCase.update({where:{id:c.id},data:{lastInboundAt:new Date(base+20000)}});
 await f.db.facebookInteractionSendAttempt.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,requestKey:randomUUID(),targetHash,payloadHash:'synthetic',status:'sent',providerId:'original-receipt',createdAt:new Date(base+30000)}});
 assert.equal(await badge(),false,'a copied receipt cannot answer a new inbound');
 assert.equal((await f.db.interactionCase.findUniqueOrThrow({where:{id:c.id}})).status,'in_progress');
 assert.deepEqual(await f.protectedSnapshot(),before);
}));

test('fresh detail inbound clears replied without changing cached case or requesting another detail',async()=>withInboxFixture(async f=>{
 const c=await f.seedVerifiedCase(),base=Date.now()-120000;
 await f.db.interactionCase.update({where:{id:c.id},data:{lastInboundAt:new Date(base)}});
 await f.db.facebookInteractionSendAttempt.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,requestKey:randomUUID(),targetHash:createHash('sha256').update(JSON.stringify(['message','300'])).digest('hex'),payloadHash:'synthetic',status:'sent',providerId:'detail-receipt',createdAt:new Date(base+10000)}});
 let calls=0,fresh=false;
 const adapter={detail:async()=>{calls++;return{items:[{id:'fresh-inbound',text:'test',inbound:true,occurredAt:new Date(base+(fresh?20000:0)).toISOString()}],nextCursor:null,capabilities:{},replyTarget:'thread-300'};}};
 const reads=createInboxReads({db:f.db,access:inboxTestAccess(f),registry:{getInboxAdapter:()=>adapter} as any,redis:{} as any,policy:inboxTestPolicy(f)});
 const query={kind:'messages',accountIds:[f.accountIds[0]]},before=await f.protectedSnapshot();
 assert.equal((await reads.getCase(f.adminCtx,c.id,query)).replied,true);
 fresh=true;assert.equal((await reads.getCase(f.adminCtx,c.id,query)).replied,false);
 assert.equal(calls,2);assert.deepEqual(await f.protectedSnapshot(),before);
 assert.equal((await f.db.interactionCase.findUniqueOrThrow({where:{id:c.id}})).lastInboundAt?.getTime(),base);
}));

test('message receipt cannot cross recipient, grant epoch or current page association',async()=>withInboxFixture(async f=>{
 const c=await f.seedVerifiedCase(),base=Date.now()-120000,targetHash=createHash('sha256').update(JSON.stringify(['message','300'])).digest('hex');
 await f.db.interactionCase.update({where:{id:c.id},data:{lastInboundAt:new Date(base)}});
 const add=(connectionVersion:number|null,providerId:string,target=targetHash,offset=10000)=>f.db.facebookInteractionSendAttempt.create({data:{managedPageId:f.pages[0].id,connectionVersion,requestKey:randomUUID(),targetHash:target,payloadHash:'synthetic',status:'sent',providerId,createdAt:new Date(base+offset)}});
 await add(1,'other-recipient',createHash('sha256').update(JSON.stringify(['message','301'])).digest('hex'));
 await add(null,'old-epoch');await add(1,'old-epoch',targetHash,20000);
 const badge=async()=> (await presentInboxCase(f.db,f.adminCtx,c.id,f.accountIds[0])).replied;
 assert.equal(await badge(),false);
 await add(1,'new-receipt',targetHash,30000);assert.equal(await badge(),true);
 await f.db.interactionCase.update({where:{id:c.id},data:{sourceRef:{...(c.sourceRef as object),connectionId:f.connections[1].id}}});assert.equal(await badge(),false);
}));
