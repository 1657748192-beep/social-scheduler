import express,{Router,type ErrorRequestHandler} from 'express';
import {z} from 'zod';
import {isValidInstagramWebhookSignature,isInstagramWebhookVerifyTokenValid} from '../services/instagramWebhookService';
import type {VerifiedInstagramEvent} from './types';
const record=(v:unknown)=>z.record(z.unknown()).parse(v),id=z.string().min(1).max(256);
function time(value:unknown,seconds=false){return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&Number.isSafeInteger(value*(seconds?1000:1))?value*(seconds?1000:1):0;}
function collect(payload:unknown){
 const root=record(payload);if(root.object!=='instagram')return[];
 const events:VerifiedInstagramEvent[]=[];
 for(const raw of z.array(z.unknown()).max(50).parse(root.entry)){
  const entry=record(raw),accountId=id.parse(entry.id);
  for(const value of z.array(z.unknown()).max(500).parse(entry.messaging??[])){
   const msg=record(value);if(!msg.message)continue;const m=record(msg.message),sender=record(msg.sender),recipient=record(msg.recipient);
   events.push({accountId,field:'messages',eventId:id.parse(m.mid),senderId:id.parse(sender.id),recipientId:id.parse(recipient.id),timestamp:time(msg.timestamp),text:m.text===undefined?undefined:z.string().max(10000).parse(m.text),isEcho:m.is_echo===true,deleted:m.is_deleted===true} as VerifiedInstagramEvent);
  }
  for(const rawChange of z.array(z.unknown()).max(500).parse(entry.changes??[])){
   const change=record(rawChange);if(change.field!=='comments')continue;const v=record(change.value),media=record(v.media),from=v.from?record(v.from):{};
   events.push({accountId,field:'comments',eventId:id.parse(v.id??v.comment_id),mediaId:id.parse(media.id),senderId:from.id===undefined?undefined:id.parse(from.id),username:from.username===undefined?undefined:z.string().max(256).parse(from.username),text:v.text===undefined?undefined:z.string().max(10000).parse(v.text),timestamp:time(entry.time,true),isEcho:false,deleted:v.deleted===true||v.verb==='remove'} as VerifiedInstagramEvent);
  }
  if(events.length>500)throw new Error('Notification event limit');
 }
 return events;
}
export function createInstagramManagementWebhook({appSecret,verifyToken,store}:{appSecret:string;verifyToken:string;store:{enqueue:(events:VerifiedInstagramEvent[])=>Promise<void>}}){
 const router=Router();router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next();});
 router.get('/',(req,res)=>{
  const challenge=req.query['hub.challenge'],token=req.query['hub.verify_token'];
  if(!verifyToken){res.status(503).type('text/plain').send('Notification verification unavailable');return;}
  if(req.query['hub.mode']==='subscribe'&&typeof challenge==='string'&&challenge.length<=256&&isInstagramWebhookVerifyTokenValid(typeof token==='string'?token:undefined,verifyToken)){res.type('text/plain').send(challenge);return;}
  res.sendStatus(403);
 });
 router.post('/',express.raw({type:'application/json',limit:'1mb'}),async(req,res)=>{
  if(!appSecret||!Buffer.isBuffer(req.body)||!isValidInstagramWebhookSignature(req.body,req.header('X-Hub-Signature-256'),appSecret)){res.sendStatus(403);return;}
  let events:VerifiedInstagramEvent[];try{events=collect(JSON.parse(req.body.toString('utf8')));}catch{res.status(400).json({message:'Invalid interaction notification'});return;}
  try{for(let start=0;start<events.length;start+=50)await store.enqueue(events.slice(start,start+50));res.json({accepted:true});}catch{res.status(503).json({message:'Interaction notification unavailable'});}
 });
 const errors:ErrorRequestHandler=(error,_req,res,_next)=>{res.status(error?.status===413?413:400).json({message:'Invalid interaction notification'});};router.use(errors);
 return router;
}
