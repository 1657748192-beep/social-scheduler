import express,{Router} from 'express';
import { createHmac,timingSafeEqual } from 'node:crypto';
import { parseFacebookWebhook, type FacebookReceivedEventInput } from '../services/facebookWebhookService';
export function createFacebookWebhookRouter(options:{enabled():boolean;appSecret:string;verifyToken:string;onEvents(events:FacebookReceivedEventInput[]):Promise<unknown>}){
  const router=Router();
  router.get('/',(req,res)=>{
    if(!options.enabled() || !options.verifyToken)return res.sendStatus(503);
    if(req.query['hub.mode']!=='subscribe' || req.query['hub.verify_token']!==options.verifyToken || typeof req.query['hub.challenge']!=='string')return res.sendStatus(403);
    return res.type('text/plain').send(req.query['hub.challenge']);
  });
  router.post('/',express.raw({type:'application/json',limit:'1mb'}),async(req,res)=>{
    if(!options.enabled() || !options.appSecret)return res.sendStatus(503);
    const supplied=req.get('X-Hub-Signature-256');
    if(!Buffer.isBuffer(req.body) || !supplied || !/^sha256=[0-9a-f]{64}$/.test(supplied))return res.sendStatus(403);
    const expected=createHmac('sha256',options.appSecret).update(req.body).digest();
    if(!timingSafeEqual(expected,Buffer.from(supplied.slice(7),'hex')))return res.sendStatus(403);
    let parsed:ReturnType<typeof parseFacebookWebhook>;
    try{parsed=parseFacebookWebhook(JSON.parse(req.body.toString('utf8')));}catch{return res.sendStatus(400);}
    try{await options.onEvents(parsed.events);return res.sendStatus(parsed.invalid?503:200);}catch{return res.sendStatus(503);}
  });
  return router;
}
