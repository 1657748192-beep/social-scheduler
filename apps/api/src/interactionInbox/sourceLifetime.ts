import type {InboxDb} from './access';
import type {SourceRef} from './types';
import {Prisma} from '@prisma/client';
export const inboxCutoff=(now=new Date())=>new Date(now.getTime()-90*86400000);
export function liveInboxCaseSql(now=new Date()){
 const cutoff=inboxCutoff(now);
 return Prisma.sql`c."createdAt">=${cutoff} AND COALESCE(c."sourceRef"->>'platform','facebook')='facebook' AND EXISTS(SELECT 1 FROM "InteractionAsset" a WHERE a.id=c."assetId" AND a.platform='facebook') AND (c."sourceRef"->>'sourceRecordId' IS NULL OR (c.kind='messages' AND EXISTS(SELECT 1 FROM facebook_interaction_messages m WHERE m.id::text=c."sourceRef"->>'sourceRecordId' AND m."managedPageId"::text=c."sourceRef"->>'managedPageId' AND m."receivedAt">=${cutoff})) OR (c.kind='comments' AND EXISTS(SELECT 1 FROM facebook_interaction_comments m WHERE m.id::text=c."sourceRef"->>'sourceRecordId' AND m."managedPageId"::text=c."sourceRef"->>'managedPageId' AND NOT m.deleted AND m."receivedAt">=${cutoff})))`;
}
export async function inboxSourceAlive(db:InboxDb,source:SourceRef,createdAt:Date,now=new Date()){
 if(source.platform==='instagram')return false; // Fail closed until its independent source store is connected.
 const cutoff=inboxCutoff(now);if(createdAt<cutoff)return false;
 if(!source.sourceRecordId)return true; // Direct Graph reads have their own bounded index lifetime.
 if(source.conversationId)return !!await db.facebookInteractionMessage.findFirst({where:{id:source.sourceRecordId,managedPageId:source.managedPageId,receivedAt:{gte:cutoff}}});
 return !!await db.facebookInteractionComment.findFirst({where:{id:source.sourceRecordId,managedPageId:source.managedPageId,deleted:false,receivedAt:{gte:cutoff}}});
}
export function startInboxRetention(retention:{pruneInbox:(now:Date,limit:number)=>Promise<number>},schedule:typeof setInterval=setInterval){
 let running:Promise<void>|null=null,stopped=false;
 const tick=()=>{if(stopped||running)return;running=(async()=>{try{await retention.pruneInbox(new Date(),50);}catch{/* Retry next bounded maintenance tick; never log customer data. */}})().finally(()=>{running=null;});};
 const timer=schedule(tick,60000);timer.unref?.();tick();
 return{async stop(){stopped=true;clearInterval(timer);await running;}};
}
