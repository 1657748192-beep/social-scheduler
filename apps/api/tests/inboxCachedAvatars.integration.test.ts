import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {withInboxFixture} from './helpers/interactionInboxFixture';import {inboxTestAccess} from './helpers/interactionInboxServices';import {presentInboxCase} from '../src/interactionInbox/cases';import {createInboxReads} from '../src/interactionInbox/reads';
import {createFacebookInboxAdapter} from '../src/interactionInbox/adapters/facebook';import {inboxTestPolicy} from './helpers/interactionInboxServices';
test('case avatars use only cached exact asset customer and Page data without network or writes',async()=>withInboxFixture(async f=>{
 const c=await f.seedVerifiedCase(0,'300','Andy Peng'),other=await f.seedVerifiedCase(1,'300','Andy Peng');
 await f.db.interactionIdentity.updateMany({where:{customerId:c.customerId!},data:{avatarUrl:'https://scontent.fbcdn.net/customer.jpg'}});await f.db.interactionIdentity.updateMany({where:{customerId:other.customerId!},data:{avatarUrl:'https://scontent.fbcdn.net/foreign.jpg'}});
 await f.db.socialAccount.update({where:{id:f.accountIds[0]},data:{avatarUrl:'https://scontent.fbcdn.net/page.jpg'}});const before=await f.protectedSnapshot(),original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No network allowed');};
 try{const dto:any=await presentInboxCase(f.db,f.adminCtx,c.id,f.accountIds[0]);assert.equal(dto.customerAvatarUrl,'https://scontent.fbcdn.net/customer.jpg');assert.equal(dto.accountAvatarUrl,'https://scontent.fbcdn.net/page.jpg');assert.deepEqual(await f.protectedSnapshot(),before);}finally{globalThis.fetch=original;}
}));
test('detail root and Page avatars never substitute the root customer for another reply author',async()=>withInboxFixture(async f=>{
 const c=await f.seedVerifiedCase(0,'300'),source={platform:'facebook',managedPageId:f.pages[0].id,connectionId:f.connections[0].id,connectionVersion:1,commentId:'c1',postId:'100_200',scheduleId:randomUUID()};await f.db.interactionCase.update({where:{id:c.id},data:{kind:'comments',sourceRef:source}});
 await f.db.interactionIdentity.updateMany({where:{customerId:c.customerId!},data:{avatarUrl:'https://scontent.fbcdn.net/customer.jpg'}});await f.db.socialAccount.update({where:{id:f.accountIds[0]},data:{avatarUrl:'https://scontent.fbcdn.net/page.jpg'}});
 const service=createInboxReads({db:f.db,access:inboxTestAccess(f),registry:{getInboxAdapter:()=>({detail:async()=>({items:[{id:'c1',text:'Root',inbound:true},{id:'r1',text:'Page',inbound:false},{id:'r2',text:'Different customer',inbound:true}].map(x=>({...x,occurredAt:new Date().toISOString()})),nextCursor:null,replyTarget:'c1',officialUrl:null,capabilities:[]})})} as any,redis:{} as any});
 const dto:any=await service.getCase(f.adminCtx,c.id,{accountIds:[f.accountIds[0]],kind:'comments'});assert.deepEqual(dto.items.map((x:any)=>x.senderAvatarUrl),['https://scontent.fbcdn.net/customer.jpg','https://scontent.fbcdn.net/page.jpg',null]);
}));
test('missing or unsafe cached avatar stays null and does not construct a Facebook lookup URL',async()=>withInboxFixture(async f=>{
 const c=await f.seedVerifiedCase();await f.db.interactionIdentity.updateMany({where:{customerId:c.customerId!},data:{avatarUrl:'https://graph.facebook.com/300/picture?access_token=secret'}});
 const dto:any=await presentInboxCase(f.db,f.adminCtx,c.id,f.accountIds[0]);assert.equal(dto.customerAvatarUrl,null);assert.equal(dto.accountAvatarUrl,null);
}));
test('Page avatar can fall back to its exact cached management Page without copying it to a customer',async()=>withInboxFixture(async f=>{
 const c=await f.seedVerifiedCase();await f.db.facebookManagedPage.update({where:{id:f.pages[0].id},data:{avatarUrl:'https://lookaside.fbsbx.com/platform/profilepic/?asid=100&ext=123&hash=cached'}});
 const dto:any=await presentInboxCase(f.db,f.adminCtx,c.id,f.accountIds[0]);assert.equal(dto.customerAvatarUrl,null);assert.equal(dto.accountAvatarUrl,'https://lookaside.fbsbx.com/platform/profilepic/?asid=100&ext=123&hash=cached');
}));
test('comment reply authors use exact asset cached identities rather than same-name foreign actors',async()=>withInboxFixture(async f=>{
 const c=await f.seedVerifiedCase(0,'300'),foreign=await f.seedVerifiedCase(1,'400');await f.db.interactionIdentity.updateMany({where:{customerId:c.customerId!},data:{avatarUrl:'https://scontent.fbcdn.net/root.jpg'}});await f.db.interactionIdentity.updateMany({where:{customerId:foreign.customerId!},data:{avatarUrl:'https://scontent.fbcdn.net/foreign.jpg'}});
 const a=await inboxTestAccess(f).resolveInboxAsset(f.adminCtx,f.accountIds[0],'comments.read'),at=new Date().toISOString(),parent={id:'c1',postId:'100_200',senderId:'300',text:'Root',timestamp:at},child={id:'r2',postId:'100_200',parentId:'c1',senderId:'400',text:'Other author',timestamp:at};
 const adapter=createFacebookInboxAdapter({db:f.db,policy:inboxTestPolicy(f),engagement:{commentReplies:async()=>({parent,items:[child],nextCursor:null}),capabilities:async()=>({})} as any});const detail=await adapter.detail(a,{...a.sourceRef!,scheduleId:randomUUID(),postId:'100_200',commentId:'c1'});assert.deepEqual(detail.items.map(x=>x.senderAvatarUrl),['https://scontent.fbcdn.net/root.jpg',null]);
}));
