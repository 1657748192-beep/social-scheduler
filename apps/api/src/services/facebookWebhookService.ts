import { createHash } from 'node:crypto';
export type FacebookReceivedEventInput={pageId:string;eventKey:string;kind:'comment'|'message';providerId:string;occurredAt:string;postId?:string;senderId?:string;senderName?:string;recipientId?:string;text?:string;deleted?:boolean;isEcho?:boolean};
const record=(value:unknown):Record<string,unknown>=>typeof value==='object' && value!==null && !Array.isArray(value)?value as Record<string,unknown>:{};
const identifier=(value:unknown)=>{if(typeof value!=='string' || !/^[a-zA-Z0-9_.:-]{1,256}$/.test(value))throw new Error('Malformed Facebook event identity.');return value;};
function time(value:unknown,milliseconds=false){
  const number=typeof value==='number'?value:NaN;
  const date=new Date(milliseconds?number:number*1000);
  if(!Number.isFinite(date.getTime()) || number<=0)throw new Error('Malformed Facebook event time.');
  return date.toISOString();
}
export function parseFacebookWebhook(payload:unknown):{events:FacebookReceivedEventInput[];ignored:number}{
  const root=record(payload),events:FacebookReceivedEventInput[]=[];let ignored=0;
  if(root.object!=='page' || !Array.isArray(root.entry))throw new Error('Malformed Facebook webhook.');
  for(const entry of root.entry){
    const item=record(entry),pageId=identifier(item.id);
    for(const raw of Array.isArray(item.changes)?item.changes:[]){
      const change=record(raw),value=record(change.value);
      if(change.field!=='feed' || value.item!=='comment'){ignored++;continue;}
      if(!['add','edited','edit','remove'].includes(String(value.verb))) {ignored++;continue;}
      const event:FacebookReceivedEventInput={pageId,eventKey:'',kind:'comment',providerId:identifier(value.comment_id),postId:identifier(value.post_id),
        occurredAt:time(item.time??value.created_time),deleted:value.verb==='remove',text:typeof value.message==='string'?value.message:undefined,
        senderId:typeof record(value.from).id==='string'?identifier(record(value.from).id):undefined,senderName:typeof record(value.from).name==='string'?String(record(value.from).name):undefined};
      if(event.deleted)event.text=undefined;
      event.eventKey=createHash('sha256').update(JSON.stringify(event)).digest('hex');events.push(event);
    }
    for(const raw of Array.isArray(item.messaging)?item.messaging:[]){
      const message=record(raw),content=record(message.message);
      if(!content.mid){ignored++;continue;}
      const event:FacebookReceivedEventInput={pageId,eventKey:'',kind:'message',providerId:identifier(content.mid),senderId:identifier(record(message.sender).id),recipientId:identifier(record(message.recipient).id),
        occurredAt:time(message.timestamp,true),text:typeof content.text==='string'?content.text:undefined,isEcho:content.is_echo===true};
      if(event.senderId!==pageId && event.recipientId!==pageId)throw new Error('Facebook message Page mismatch.');
      event.eventKey=`message:${event.providerId}`;events.push(event);
    }
  }
  return {events,ignored};
}
