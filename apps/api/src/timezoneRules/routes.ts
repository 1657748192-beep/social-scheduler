import {Router,type RequestHandler} from 'express';
import {requireAuth} from '../middleware/auth';
import {isPlatformAdmin} from '../utils/platformAdmin';
import type {RulesRuntime} from './runtime';
export function createRulesRouter(runtime:RulesRuntime,{auth=requireAuth,admin=isPlatformAdmin}:{auth?:RequestHandler;admin?:(email:string)=>boolean}={}){
 const router=Router(),windows=new Map<string,{at:number;count:number}>();
 router.use(auth,(req,res,next)=>{
  const now=Date.now(),id=req.user!.id;
  if(windows.size>5000){for(const [key,w]of windows)if(now-w.at>=60000)windows.delete(key);}
  if(!windows.has(id)&&windows.size>=10000){res.status(429).end();return;}
  let w=windows.get(id);if(!w||now-w.at>=60000){w={at:now,count:0};windows.set(id,w);}if(++w.count>60){res.set('Retry-After','60').sendStatus(429);return;}next();
 });
 router.get('/status',async(req,res,next)=>{if(!admin(req.user!.email)){res.sendStatus(403);return;}try{res.set('Cache-Control','private, no-store').json(await runtime.getStatus());}catch(e){next(e);}});
 router.get('/manifest',async(req,res,next)=>{try{const b=await runtime.getBundle(),etag=`"${b.sha256}"`;res.set('Cache-Control','private, no-cache').set('ETag',etag);if(req.headers['if-none-match']===etag){res.status(304).end();return;}res.json({version:b.tzdbVersion,digest:b.sha256,schemaVersion:1,engineCompatibility:1});}catch(e){next(e);}});
 router.get('/data/:version',async(req,res)=>{
  if(!/^\d{4}[a-z]{1,2}$/.test(req.params.version)){res.sendStatus(400);return;}
  try{const b=await runtime.getBundle(req.params.version);res.set('Cache-Control','private, max-age=86400').set('ETag',`"${b.sha256}"`).json(b);}catch{res.sendStatus(404);}
 });
 return router;
}
