import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { FacebookReceivedEventInput } from './facebookWebhookService';
export type FacebookEventClaim={id:string;socialAccountId:string;claimToken:string;payload:FacebookReceivedEventInput};
export function createFacebookReceptionStore(db:PrismaClient){
  return {
    async enqueue(events:FacebookReceivedEventInput[]){
      await db.$transaction(async tx=>{
        for(const event of events){
          const accounts=await tx.socialAccount.findMany({where:{platform:'facebook',accountType:'page',providerAccountId:event.pageId,status:'active'},select:{id:true}});
          for(const account of accounts)await tx.facebookReceivedEvent.createMany({skipDuplicates:true,data:[{socialAccountId:account.id,eventKey:event.eventKey,payload:JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue}]});
        }
      });
    },
    async claimBatch(now:Date,limit:number):Promise<FacebookEventClaim[]>{
      const count=Math.max(1,Math.min(50,Math.floor(limit)||1));
      return db.$transaction(async tx=>{
        await tx.facebookReceivedEvent.updateMany({where:{status:'processing',attempts:{gte:5},leaseUntil:{lte:now}},
          data:{status:'failed',claimToken:null,leaseUntil:null,lastError:'Processing lease expired after maximum attempts.'}});
        // Row locks and leases make independent worker processes safe.
        const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM facebook_received_events
          WHERE attempts < 5 AND "nextAttemptAt" <= ${now}
          AND (status = 'pending' OR (status = 'processing' AND "leaseUntil" <= ${now}))
          ORDER BY "receivedAt" ASC FOR UPDATE SKIP LOCKED LIMIT ${count}`;
        const claims:FacebookEventClaim[]=[];
        for(const row of rows){
          const claimToken=randomUUID();
          const event=await tx.facebookReceivedEvent.update({where:{id:row.id},data:{status:'processing',claimToken,leaseUntil:new Date(now.getTime()+60000),attempts:{increment:1}}});
          if(event.payload)claims.push({id:event.id,socialAccountId:event.socialAccountId,claimToken,payload:event.payload as unknown as FacebookReceivedEventInput});
        }
        return claims;
      });
    },
    async processClaim(claim:FacebookEventClaim,now:Date){
      await db.$transaction(async tx=>{
        const owned=await tx.facebookReceivedEvent.findFirst({where:{id:claim.id,claimToken:claim.claimToken,status:'processing',leaseUntil:{gt:now}}});
        if(!owned)return;
        const account=await tx.socialAccount.findFirst({where:{id:claim.socialAccountId,platform:'facebook',accountType:'page',status:'active'}});
        if(!account || account.providerAccountId!==claim.payload.pageId)return;
        const event=claim.payload,occurredAt=new Date(event.occurredAt);
        if(!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime()<now.getTime()-90*86400000)return;
        let changed=false;
        if(event.kind==='comment'){
          if(!event.postId)throw new Error('Comment post missing.');
          const inserted=await tx.facebookReceivedComment.createMany({skipDuplicates:true,data:[{socialAccountId:account.id,providerCommentId:event.providerId,postId:event.postId,
            text:event.deleted?null:event.text??null,senderId:event.senderId,senderName:event.senderName,deleted:event.deleted===true,occurredAt}]});
          if(inserted.count)changed=true;
          else{
            const result=await tx.facebookReceivedComment.updateMany({where:{socialAccountId:account.id,providerCommentId:event.providerId,
              OR:[{occurredAt:{lt:occurredAt}},...(event.deleted?[{occurredAt,deleted:false}]:[])]},data:{postId:event.postId,text:event.deleted?null:event.text??null,
                senderId:event.senderId,senderName:event.senderName,deleted:event.deleted===true,occurredAt}});
            changed=result.count>0;
          }
        }else{
          if(!event.senderId || !event.recipientId || (event.senderId!==account.providerAccountId && event.recipientId!==account.providerAccountId))throw new Error('Message participants invalid.');
          const inbound=!event.isEcho && event.recipientId===account.providerAccountId && event.senderId!==account.providerAccountId;
          const counterpartyId=event.senderId===account.providerAccountId?event.recipientId:event.senderId;
          await tx.facebookReceivedThread.createMany({skipDuplicates:true,data:[{socialAccountId:account.id,counterpartyId}]});
          const thread=await tx.facebookReceivedThread.findUniqueOrThrow({where:{socialAccountId_counterpartyId:{socialAccountId:account.id,counterpartyId}}});
          const result=await tx.facebookReceivedMessage.createMany({skipDuplicates:true,data:[{threadId:thread.id,providerMessageId:event.providerId,senderId:event.senderId,recipientId:event.recipientId,
            text:event.text,inbound,occurredAt}]});
          changed=result.count>0;
          if(changed){
            await tx.facebookReceivedThread.updateMany({where:{id:thread.id,updatedAt:{lt:occurredAt}},data:{updatedAt:occurredAt}});
            if(inbound && occurredAt<=now)await tx.facebookReceivedThread.updateMany({where:{id:thread.id,OR:[{lastInboundAt:null},{lastInboundAt:{lt:occurredAt}}]},data:{lastInboundAt:occurredAt}});
          }
        }
        if(changed){
          await tx.facebookReceptionState.createMany({skipDuplicates:true,data:[{socialAccountId:account.id}]});
          await tx.facebookReceptionState.update({where:{socialAccountId:account.id},data:{revision:{increment:1},lastReceivedAt:now}});
        }
      });
    },
    async finishClaim(id:string,claimToken:string){
      const result=await db.facebookReceivedEvent.updateMany({where:{id,claimToken,status:'processing',leaseUntil:{gt:new Date()}},data:{status:'done',payload:Prisma.DbNull,claimToken:null,leaseUntil:null,lastError:null}});
      return result.count===1;
    },
    async failClaim(id:string,claimToken:string,_reason:string){
      const row=await db.facebookReceivedEvent.findFirst({where:{id,claimToken,status:'processing'}});if(!row)return;
      await db.facebookReceivedEvent.updateMany({where:{id,claimToken,status:'processing'},data:{status:row.attempts>=5?'failed':'pending',claimToken:null,leaseUntil:null,
        nextAttemptAt:new Date(Date.now()+Math.min(60000,1000*2**row.attempts)),lastError:'Processing failed; see event diagnostic ID.'}});
    },
    async latestInbound(socialAccountId:string,counterpartyId:string){
      return (await db.facebookReceivedThread.findUnique({where:{socialAccountId_counterpartyId:{socialAccountId,counterpartyId}}}))?.lastInboundAt??null;
    },
    async listReceivedConversations(socialAccountId:string){
      const rows=await db.facebookReceivedThread.findMany({where:{socialAccountId},orderBy:{updatedAt:'desc'},take:100});
      return rows.map(row=>({id:'local:'+row.id,counterpartyId:row.counterpartyId,updatedAt:row.updatedAt.toISOString()}));
    },
    async listReceivedComments(socialAccountId:string,postId:string,ids:string[]=[],includeRecent=true){
      const matched=ids.length?await db.facebookReceivedComment.findMany({where:{socialAccountId,postId,providerCommentId:{in:ids}}}):[];
      const recent=includeRecent?await db.facebookReceivedComment.findMany({where:{socialAccountId,postId},orderBy:{occurredAt:'desc'},take:100}):[];
      const rows=new Map([...matched,...recent].map(row=>[row.providerCommentId,row]));
      return [...rows.values()].map(row=>({id:row.providerCommentId,postId:row.postId,text:row.text??'',senderId:row.senderId??undefined,senderName:row.senderName??undefined,timestamp:row.occurredAt.toISOString(),deleted:row.deleted}));
    },
    async getReceivedConversation(socialAccountId:string,id:string){
      if(!/^local:[0-9a-f-]{36}$/i.test(id))return null;
      const row=await db.facebookReceivedThread.findFirst({where:{id:id.slice(6),socialAccountId}});
      return row?{id,counterpartyId:row.counterpartyId,updatedAt:row.updatedAt.toISOString()}:null;
    },
    async listReceivedMessages(socialAccountId:string,id:string,after?:string){
      if(!/^local:[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid received conversation.');
      const thread=await db.facebookReceivedThread.findFirst({where:{id:id.slice(6),socialAccountId}});
      if(!thread)throw new Error('Received conversation not found.');
      if(after && !/^[0-9a-f-]{36}$/i.test(after))throw new Error('Invalid received cursor.');
      if(after && !await db.facebookReceivedMessage.findFirst({where:{id:after,threadId:thread.id}}))throw new Error('Received cursor not found.');
      const rows=await db.facebookReceivedMessage.findMany({where:{threadId:thread.id},orderBy:[{occurredAt:'desc'},{id:'desc'}],take:51,...(after?{cursor:{id:after},skip:1}:{})});
      return {items:rows.slice(0,50).map(row=>({id:row.providerMessageId,conversationId:id,senderId:row.senderId,recipientId:row.recipientId,text:row.text??'',inbound:row.inbound,timestamp:row.occurredAt.toISOString()})),nextCursor:rows.length>50?rows[49].id:null};
    },
    async cleanup(now:Date){
      const cutoff=new Date(now.getTime()-90*86400000);
      await db.$transaction(async tx=>{
        await tx.facebookReceivedMessage.deleteMany({where:{receivedAt:{lt:cutoff}}});
        await tx.facebookReceivedComment.deleteMany({where:{receivedAt:{lt:cutoff}}});
        await tx.facebookReceivedEvent.deleteMany({where:{receivedAt:{lt:cutoff}}});
        await tx.facebookReceivedThread.deleteMany({where:{messages:{none:{}}}});
      });
    }
  };
}
