import type {MetaInboxFixture} from './metaInboxFixture';
export async function seedDeletionCustomer(f:MetaInboxFixture,actorId='300'){
 const workspaceId=f.adminCtx.workspaceId,connectionId=f.instagramConnectionIds[0];
 const asset=await f.db.interactionAsset.upsert({where:{workspaceId_canonicalKey:{workspaceId,canonicalKey:JSON.stringify(['instagram','456','100'])}},create:{workspaceId,canonicalKey:JSON.stringify(['instagram','456','100']),platform:'instagram',appNamespace:'456',providerAssetId:'100',instagramConnectionId:connectionId,connectionVersion:1},update:{}});
 const customer=await f.db.interactionCustomer.create({data:{workspaceId}});
 const identity=await f.db.interactionIdentity.create({data:{workspaceId,assetId:asset.id,customerId:customer.id,platform:'instagram',appNamespace:'456',providerActorId:actorId,displayName:'Synthetic visitor '+actorId}});
 const base={platform:'instagram' as const,instagramAccountId:f.instagramAccountIds[0],connectionId,connectionVersion:1};
 const comment=await f.db.instagramInteractionComment.create({data:{workspaceId,connectionId,connectionVersion:1,providerId:'comment-'+actorId,mediaId:'media-own',actorId,inbound:true,text:'Synthetic comment',occurredAt:new Date()}});
 const message=await f.db.instagramInteractionMessage.create({data:{workspaceId,connectionId,connectionVersion:1,providerId:'message-'+actorId,conversationId:'local:'+actorId,actorId,inbound:true,text:'Synthetic message',occurredAt:new Date()}});
 const cases=[];
 for(const [kind,row,ref]of [['comments',comment,{...base,sourceRecordId:comment.id,mediaId:'media-own',commentId:comment.providerId}],['messages',message,{...base,sourceRecordId:message.id,conversationId:message.conversationId,participantId:actorId}]] as const){
  const c=await f.db.interactionCase.create({data:{workspaceId,assetId:asset.id,customerId:customer.id,kind,providerThreadOrEventId:kind+'-'+actorId,sourceRef:ref,lastInboundAt:new Date(),lastInboundKey:row.providerId}});
  await f.db.interactionItem.create({data:{workspaceId,assetId:asset.id,caseId:c.id,platform:'instagram',providerEventId:row.providerId,direction:'inbound',occurredAt:new Date(),sourceRef:ref}});
  await f.db.readReceipt.create({data:{workspaceId,caseId:c.id,userId:f.userId,lastReadAt:new Date(),lastReadKey:row.providerId}});cases.push(c);
 }
 const customerTag=await f.db.interactionTag.create({data:{workspaceId,kind:'customer',name:'Priority '+actorId,normalizedName:'priority-'+actorId,color:'#16a34a'}});
 const caseTag=await f.db.interactionTag.create({data:{workspaceId,kind:'case',name:'Inquiry '+actorId,normalizedName:'inquiry-'+actorId,color:'#2563eb'}});
 await f.db.interactionCustomerTag.create({data:{workspaceId,customerId:customer.id,tagId:customerTag.id}});
 await f.db.interactionCaseTag.createMany({data:cases.map(c=>({workspaceId,caseId:c.id,tagId:caseTag.id}))});
 const note=await f.db.customerNote.create({data:{workspaceId,customerId:customer.id,authorId:f.userId,text:'Synthetic private note '+actorId}});
 await f.db.interactionSyncState.upsert({where:{assetId_kind:{assetId:asset.id,kind:'messages'}},create:{workspaceId,assetId:asset.id,kind:'messages',cursor:'synthetic-cursor'},update:{}});
 return{asset,customer,identity,comment,message,cases,note,customerTag,caseTag};
}
