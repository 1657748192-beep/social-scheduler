import {Router,type Request,type RequestHandler} from 'express';
import {z} from 'zod';
import {requireAuth} from '../middleware/auth';
import {HttpError} from '../utils/errors';
import type {Scope} from '../interactionInbox/types';
import type {InstagramManagementRuntime} from './runtime';
export function createInstagramManagementRouter(runtime:InstagramManagementRuntime,options:{webAppUrl:string;authenticate?:RequestHandler}){
 const router=Router(),base='/workspaces/:workspaceId/instagram-management';
 const ctx=(req:Request):Scope=>{if(!req.user?.sessionId)throw new HttpError(401,'Authentication required');return{workspaceId:z.string().uuid().parse(req.params.workspaceId),userId:req.user.id,sessionId:req.user.sessionId};};
 const redirect=new URL('/inbox',options.webAppUrl);if(!['https:','http:'].includes(redirect.protocol)||redirect.username||redirect.password)throw new Error('Invalid web application origin');
 router.get('/integrations/instagram-management/oauth/callback',async(req,res)=>{
  const target=new URL(redirect);res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  try{const q=z.object({state:z.string().max(256),code:z.string().max(8192).optional(),error:z.string().max(256).optional()}).passthrough().parse(req.query);await runtime.oauth.callback(q);target.searchParams.set('instagram_management','success');}
  catch{target.searchParams.set('instagram_management','failed');}
  res.redirect(target.href);
 });
 router.use(base,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();},options.authenticate??requireAuth,async(req,_res,next)=>{try{await runtime.require(ctx(req),req.method==='GET'?'read':'manage');next();}catch(e){next(e);}});
 router.post(base+'/oauth/start',async(req,res,next)=>{try{const body=z.object({accountId:z.string().uuid()}).strict().parse(req.body);res.json(await runtime.oauth.start(ctx(req),body.accountId));}catch(e){next(e);}});
 router.get(base+'/status',async(req,res,next)=>{try{const q=z.object({accountId:z.string().uuid()}).strict().parse(req.query);res.json(await runtime.status(ctx(req),q.accountId));}catch(e){next(e);}});
 router.delete(base+'/connections/:id',async(req,res,next)=>{try{res.json(await runtime.disconnect(ctx(req),z.string().uuid().parse(req.params.id)));}catch(e){next(e);}});
 return router;
}
