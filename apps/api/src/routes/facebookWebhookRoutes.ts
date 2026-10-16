import express,{Router,type ErrorRequestHandler} from 'express';
import { createHmac,timingSafeEqual } from 'node:crypto';
import { parseFacebookWebhook, type FacebookReceivedEventInput } from '../services/facebookWebhookService';
export type FacebookWebhookDiagnostic={outcome:'disabled'|'signature_rejected'|'malformed'|'accepted'|'invalid_events'|'enqueue_failed';httpStatus:number;comments:number;messages:number;ignored:number;invalid:number};
export function createFacebookWebhookRouter(options:{enabled():boolean;appSecret:string;verifyToken:string;onEvents(events:FacebookReceivedEventInput[]):Promise<unknown>;onDiagnostic?(value:FacebookWebhookDiagnostic):void}){
  const router=Router();
  router.get('/',(req,res)=>{
    if(!options.enabled() || !options.verifyToken)return res.sendStatus(503);
    if(req.query['hub.mode']!=='subscribe' || req.query['hub.verify_token']!==options.verifyToken || typeof req.query['hub.challenge']!=='string')return res.sendStatus(403);
    return res.type('text/plain').send(req.query['hub.challenge']);
  });
  router.post('/',express.raw({type:'application/json',limit:'1mb'}),async(req,res)=>{
    let comments=0,messages=0,ignored=0,invalid=0;
    const respond=(httpStatus:number,outcome:FacebookWebhookDiagnostic['outcome'])=>{
      // Never log request bodies, headers, identifiers, URLs or exception text.
      try{options.onDiagnostic?.({outcome,httpStatus,comments,messages,ignored,invalid});}catch{/* Diagnostics must not affect acknowledgement. */}
      return res.sendStatus(httpStatus);
    };
    if(!options.enabled() || !options.appSecret)return respond(503,'disabled');
    const supplied=req.get('X-Hub-Signature-256');
    if(!Buffer.isBuffer(req.body) || !supplied || !/^sha256=[0-9a-f]{64}$/.test(supplied))return respond(403,'signature_rejected');
    const expected=createHmac('sha256',options.appSecret).update(req.body).digest();
    if(!timingSafeEqual(expected,Buffer.from(supplied.slice(7),'hex')))return respond(403,'signature_rejected');
    let parsed:ReturnType<typeof parseFacebookWebhook>;
    try{parsed=parseFacebookWebhook(JSON.parse(req.body.toString('utf8')));}catch{return respond(400,'malformed');}
    comments=parsed.events.filter(event=>event.kind==='comment').length;
    messages=parsed.events.filter(event=>event.kind==='message').length;
    ignored=parsed.ignored;invalid=parsed.invalid;
    try{await options.onEvents(parsed.events);return respond(parsed.invalid?503:200,parsed.invalid?'invalid_events':'accepted');}catch{return respond(503,'enqueue_failed');}
  });
  const parserError:ErrorRequestHandler=(error,_req,res,_next)=>{
    if(res.headersSent||res.destroyed)return;
    const status=error?.type==='entity.too.large'?413:400;
    try{options.onDiagnostic?.({outcome:'malformed',httpStatus:status,comments:0,messages:0,ignored:0,invalid:0});}catch{/* No raw parser error or request body is logged. */}
    res.sendStatus(status);
  };
  router.use(parserError);return router;
}
