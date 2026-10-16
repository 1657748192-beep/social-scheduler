import {randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient} from '@prisma/client';
import type {FacebookReceivedEventInput} from '../services/facebookWebhookService';
export type ManagementEventClaim={id:string;managedPageId:string;claimToken:string;payload:FacebookReceivedEventInput};
export function createFacebookManagementReceptionStore({db,appId}:{db:PrismaClient;appId:string}){
  async function available(tx:Prisma.TransactionClient,id:string,pageId:string,now:Date){
    const page=await tx.facebookManagedPage.findFirst({where:{id,pageId,active:true,notificationsEnabled:true,connection:{appId,status:'active'}},include:{connection:true}});
    if(!page)return null;
    await tx.$queryRaw`SELECT id FROM facebook_management_connections WHERE id=${page.connectionId}::uuid FOR UPDATE`;
    const current=await tx.facebookManagedPage.findFirst({where:{id,pageId,active:true,notificationsEnabled:true,connection:{appId,status:'active',OR:[{expiresAt:null},{expiresAt:{gt:now}}]}},include:{connection:true}});
    if(!current||current.expiresAt&&current.expiresAt<=now)return null;
    const member=await tx.workspaceMember.findFirst({where:{userId:current.connection.userId,workspaceId:current.connection.workspaceId,status:'active',role:{in:['owner','admin']}}});
    const binding=await tx.socialAccount.findFirst({where:{workspaceId:current.connection.workspaceId,platform:'facebook',accountType:'page',providerAccountId:pageId,status:'active'},select:{id:true}});
    return member&&binding?current:null;
  }
  return {
    async enqueue(events:FacebookReceivedEventInput[]){
      await db.$transaction(async tx=>{
        for(const event of events){
          const pages=await tx.facebookManagedPage.findMany({where:{pageId:event.pageId,active:true,notificationsEnabled:true,connection:{appId,status:'active'}},select:{id:true},orderBy:{id:'asc'}});
          for(const page of pages)if(await available(tx,page.id,event.pageId,new Date()))await tx.facebookInteractionEvent.createMany({skipDuplicates:true,data:[{managedPageId:page.id,eventKey:event.eventKey,payload:JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue}]});
        }
      },{timeout:20000});
    },
    async claimBatch(now:Date,limit:number):Promise<ManagementEventClaim[]>{
      const count=Math.max(1,Math.min(50,Math.floor(limit)||1));
      return db.$transaction(async tx=>{
        await tx.facebookInteractionEvent.updateMany({where:{status:'processing',attempts:{gte:8},leaseUntil:{lte:now}},data:{status:'dead',claimToken:null,leaseUntil:null,diagnosticId:randomUUID()}});
        const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM facebook_interaction_events WHERE attempts<8 AND "availableAt"<=${now}
          AND (status='pending' OR (status='processing' AND "leaseUntil"<=${now})) ORDER BY "receivedAt",id FOR UPDATE SKIP LOCKED LIMIT ${count}`;
        const claims:ManagementEventClaim[]=[];
        for(const row of rows){const claimToken=randomUUID();const event=await tx.facebookInteractionEvent.update({where:{id:row.id},data:{status:'processing',claimToken,leaseUntil:new Date(now.getTime()+60000),attempts:{increment:1}}});
          claims.push({id:event.id,managedPageId:event.managedPageId,claimToken,payload:event.payload as unknown as FacebookReceivedEventInput});}
        return claims;
      });
    },
    async processClaim(claim:ManagementEventClaim,now:Date){
      return db.$transaction(async tx=>{
        const before=await tx.facebookInteractionEvent.findFirst({where:{id:claim.id,managedPageId:claim.managedPageId,claimToken:claim.claimToken,status:'processing',leaseUntil:{gt:now}}});
        if(!before)return false;
        const event=before.payload as unknown as FacebookReceivedEventInput;
        const page=await available(tx,before.managedPageId,event.pageId,now);if(!page)return true;
        await tx.$queryRaw`SELECT id FROM facebook_interaction_events WHERE id=${claim.id}::uuid FOR UPDATE`;
        if(!await tx.facebookInteractionEvent.findFirst({where:{id:claim.id,claimToken:claim.claimToken,status:'processing',leaseUntil:{gt:now}}}))return false;
        const occurredAt=new Date(event.occurredAt);if(!Number.isFinite(occurredAt.getTime())||occurredAt.getTime()<now.getTime()-90*86400000||occurredAt.getTime()>now.getTime()+60000)return true;
        if(event.kind==='comment'){
          if(!event.postId)throw Error('Invalid management comment event');
          const data={postId:event.postId,text:event.deleted?null:event.text??null,senderId:event.senderId,senderName:event.senderName,deleted:event.deleted===true,occurredAt};
          const inserted=await tx.facebookInteractionComment.createMany({skipDuplicates:true,data:[{managedPageId:page.id,providerId:event.providerId,...data}]});
          if(!inserted.count)await tx.facebookInteractionComment.updateMany({where:{managedPageId:page.id,providerId:event.providerId,...(!event.deleted?{deleted:false}:{}),OR:[{occurredAt:{lt:occurredAt}},...(event.deleted?[{occurredAt,deleted:false}]:[])]},data});
        }else if(event.kind==='message'){
          if(!event.senderId||!event.recipientId||event.senderId===event.recipientId||(event.senderId!==page.pageId&&event.recipientId!==page.pageId))throw Error('Invalid management message event');
          const participantId=event.senderId===page.pageId?event.recipientId:event.senderId;
          await tx.facebookInteractionThread.createMany({skipDuplicates:true,data:[{managedPageId:page.id,participantId,updatedAt:occurredAt}]});
          const inserted=await tx.facebookInteractionMessage.createMany({skipDuplicates:true,data:[{managedPageId:page.id,providerId:event.providerId,participantId,senderId:event.senderId,recipientId:event.recipientId,text:event.text,isEcho:event.isEcho===true,occurredAt}]});
          if(inserted.count){
            await tx.facebookInteractionThread.updateMany({where:{managedPageId:page.id,participantId,updatedAt:{lt:occurredAt}},data:{updatedAt:occurredAt}});
            if(!event.isEcho&&event.recipientId===page.pageId&&event.senderId!==page.pageId&&occurredAt<=now)await tx.facebookInteractionThread.updateMany({where:{managedPageId:page.id,participantId,OR:[{lastInboundAt:null},{lastInboundAt:{lt:occurredAt}}]},data:{lastInboundAt:occurredAt}});
          }
        }else throw Error('Invalid management event kind');
        return true;
      });
    },
    async finishClaim(id:string,claimToken:string){
      const result=await db.facebookInteractionEvent.updateMany({where:{id,claimToken,status:'processing',leaseUntil:{gt:new Date()}},data:{status:'done',payload:{},claimToken:null,leaseUntil:null,diagnosticId:null}});return result.count===1;
    },
    async failClaim(id:string,claimToken:string){
      const row=await db.facebookInteractionEvent.findFirst({where:{id,claimToken,status:'processing',leaseUntil:{gt:new Date()}}});if(!row)return false;
      const result=await db.facebookInteractionEvent.updateMany({where:{id,claimToken,status:'processing'},data:{status:row.attempts>=8?'dead':'pending',claimToken:null,leaseUntil:null,diagnosticId:randomUUID(),availableAt:new Date(Date.now()+Math.min(3600000,5000*2**(row.attempts-1)))}});return result.count===1;
    },
    async latestInbound(managedPageId:string,participantId:string){return(await db.facebookInteractionThread.findUnique({where:{managedPageId_participantId:{managedPageId,participantId}}}))?.lastInboundAt??null;},
    async comments(managedPageId:string,postId:string,ids:string[]=[],recent=true){
      const matched=ids.length?await db.facebookInteractionComment.findMany({where:{managedPageId,postId,providerId:{in:ids}}}):[];
      const rows=recent?await db.facebookInteractionComment.findMany({where:{managedPageId,postId},orderBy:{occurredAt:'desc'},take:100}):[];
      return [...new Map([...matched,...rows].map(row=>[row.providerId,row])).values()].map(row=>({id:row.providerId,postId,text:row.text??'',senderId:row.senderId??undefined,senderName:row.senderName??undefined,timestamp:row.occurredAt.toISOString(),deleted:row.deleted}));
    },
    async messages(managedPageId:string,participantId:string,conversationId:string){
      const rows=await db.facebookInteractionMessage.findMany({where:{managedPageId,participantId},orderBy:[{occurredAt:'desc'},{id:'desc'}],take:100});
      return rows.map(row=>({id:row.providerId,conversationId,senderId:row.senderId,recipientId:row.recipientId,text:row.text??'',timestamp:row.occurredAt.toISOString(),inbound:!row.isEcho&&row.senderId===participantId}));
    },
    async lastNotification(managedPageId:string){return(await db.facebookInteractionEvent.findFirst({where:{managedPageId,status:'done'},orderBy:{receivedAt:'desc'},select:{receivedAt:true}}))?.receivedAt??null;},
    async prune(now:Date){
      const cutoff=new Date(now.getTime()-90*86400000);
      await db.$transaction(async tx=>{
        await tx.facebookInteractionMessage.deleteMany({where:{receivedAt:{lt:cutoff}}});await tx.facebookInteractionComment.deleteMany({where:{receivedAt:{lt:cutoff}}});
        await tx.facebookInteractionEvent.deleteMany({where:{receivedAt:{lt:cutoff}}});await tx.facebookInteractionSendAttempt.deleteMany({where:{createdAt:{lt:cutoff}}});
        await tx.$executeRaw`DELETE FROM facebook_interaction_threads t WHERE t."receivedAt"<${cutoff} AND NOT EXISTS (SELECT 1 FROM facebook_interaction_messages m WHERE m."managedPageId"=t."managedPageId" AND m."participantId"=t."participantId")`;
        await tx.facebookManagementOAuthState.deleteMany({where:{expiresAt:{lt:now}}});
      });
    }
  };
}
