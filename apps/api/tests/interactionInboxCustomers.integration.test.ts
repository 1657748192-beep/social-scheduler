import test from 'node:test';import assert from 'node:assert/strict';import {withInboxFixture} from './helpers/interactionInboxFixture';import {inboxTestAccess} from './helpers/interactionInboxServices';
test('sameNamesNeverMergeAndNotesNeverSend',async()=>withInboxFixture(async f=>{
 const m=await import('../src/interactionInbox/customers').catch(()=>null),l=await import('../src/interactionInbox/labels').catch(()=>null);assert.ok(m&&l,'customer and label services required');
 const access=inboxTestAccess(f),customers=m.createInboxCustomers({db:f.db,access}),labels=l.createInboxLabels({db:f.db,access}),c=await f.seedVerifiedCase(),before=await f.protectedSnapshot();
 await f.seedVerifiedCase(1);assert.equal(await f.db.interactionCustomer.count({where:{workspaceId:{in:f.workspaceIds}}}),2);
 const note=await customers.saveNote(f.adminCtx,c.customerId!,'internal only');assert.equal(note.text,'internal only');
 await assert.rejects(customers.saveNote(f.adminCtx,c.customerId!,'x'.repeat(2001)));await assert.rejects(customers.saveNote(f.viewerCtx,c.customerId!,'denied'));
 const tag=await labels.mutateTag(f.adminCtx,{op:'create',kind:'customer',name:' VIP ',color:'green'});assert.ok(tag);
 await assert.rejects(labels.mutateTag(f.adminCtx,{op:'create',kind:'customer',name:'vip',color:'green'}));
 await assert.rejects(labels.mutateTag(f.adminCtx,{op:'create',kind:'customer',name:'x'.repeat(31),color:'green'}));
 await labels.setTags(f.adminCtx,{kind:'customer',id:c.customerId!},[tag!.id],1);
 const customer=await customers.getCustomer(f.adminCtx,c.customerId!);assert.equal(customer.tags.length,1);assert.equal(customer.notes.length,1);
 await assert.rejects(customers.getCustomer({...f.adminCtx,accountIds:[f.accountIds[1]]},c.customerId!),(e:any)=>e.statusCode===404);
 const scoped=await customers.getCustomer({...f.adminCtx,accountIds:[f.accountIds[0]]},c.customerId!);assert.equal(scoped.id,c.customerId);
 const account=await f.db.socialAccount.findUniqueOrThrow({where:{id:f.accountIds[0]}});assert.ok(scoped.cases[0].sourceLabel.includes(account.displayName));
 const renamed=await labels.mutateTag(f.adminCtx,{op:'rename',id:tag!.id,version:1,name:'Wholesale',color:'blue'});assert.equal(renamed!.id,tag!.id);
 await assert.rejects(labels.setTags(f.adminCtx,{kind:'customer',id:c.customerId!},[],1));
 await labels.mutateTag(f.adminCtx,{op:'delete',id:tag!.id,version:2});assert.equal(await f.db.interactionCase.count({where:{id:c.id}}),1);
 const current=await customers.getCustomer(f.adminCtx,c.customerId!);await customers.deleteCustomer(f.adminCtx,c.customerId!,current.version);assert.equal(await f.db.interactionCustomer.count({where:{id:c.customerId!}}),0);assert.deepEqual(await f.protectedSnapshot(),before);
}));
test('tag and note caps are atomic and exact',async()=>withInboxFixture(async f=>{
 const m=await import('../src/interactionInbox/customers').catch(()=>null),l=await import('../src/interactionInbox/labels').catch(()=>null);assert.ok(m&&l);
 const access=inboxTestAccess(f),customers=m.createInboxCustomers({db:f.db,access}),labels=l.createInboxLabels({db:f.db,access}),c=await f.seedVerifiedCase();
 await f.db.customerNote.createMany({data:Array.from({length:99},()=>({workspaceId:f.adminCtx.workspaceId,customerId:c.customerId!,authorId:f.adminCtx.userId,text:'seed'}))});
 await customers.saveNote(f.adminCtx,c.customerId!,'x'.repeat(2000));await assert.rejects(customers.saveNote(f.adminCtx,c.customerId!,'overflow'));
 await f.db.interactionTag.createMany({data:Array.from({length:199},(_,i)=>({workspaceId:f.adminCtx.workspaceId,kind:'customer',name:'tag'+i,normalizedName:'tag'+i,color:'blue'}))});
 await labels.mutateTag(f.adminCtx,{op:'create',kind:'customer',name:'x'.repeat(30),color:'blue'});await assert.rejects(labels.mutateTag(f.adminCtx,{op:'create',kind:'case',name:'overflow',color:'blue'}));
 const tags=await f.db.interactionTag.findMany({where:{workspaceId:f.adminCtx.workspaceId},take:11});await labels.setTags(f.adminCtx,{kind:'customer',id:c.customerId!},tags.slice(0,10).map(t=>t.id),1);await assert.rejects(labels.setTags(f.adminCtx,{kind:'customer',id:c.customerId!},tags.map(t=>t.id),2));
}));
