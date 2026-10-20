import express,{Router,type Request,type RequestHandler,type ErrorRequestHandler} from 'express';import {z} from 'zod';
import {requireAuth} from '../middleware/auth';import {HttpError} from '../utils/errors';
import {digestSecret} from './repository';import {invitationFlowCookie} from './flows';import type {PageImportRuntime} from './runtime';import type {InvitationContext} from './types';
export function publicInvitationBodyParser(){const router=Router();router.use(express.json({limit:'2kb'}));const sanitize:ErrorRequestHandler=(error,_req,res,_next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.status(error?.type==='entity.too.large'?413:400).json({message:'Authorization input unavailable'});};router.use(sanitize);return router;}
export function createInvitationRouter(getRuntime:()=>PageImportRuntime,options:{webAppUrl:string;authenticate?:RequestHandler}){
 const router=Router(),auth=options.authenticate??requireAuth,origin=new URL(options.webAppUrl).origin,base='/workspaces/:workspaceId/facebook-page-import-invitations';
 const cookie=(req:Request)=>{const parts=(req.headers.cookie??'').split(';').map(p=>p.trim()).filter(p=>p.startsWith(invitationFlowCookie.name+'='));return parts.length===1?parts[0].slice(invitationFlowCookie.name.length+1):undefined;};
 const context=(req:Request):InvitationContext=>{if(!req.user?.sessionId)throw new HttpError(401,'Authentication required');return{userId:req.user.id,sessionId:req.user.sessionId,workspaceId:z.string().uuid().parse(req.params.workspaceId)};};
 const noStore:RequestHandler=(_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next();};
 router.use(base,noStore);router.use('/facebook-page-import-public',noStore);
 router.get('/integrations/:platform/oauth/callback',async(req,res,next)=>{
  const states=Array.isArray(req.query.state)?req.query.state:[req.query.state];
  if(!states.some(value=>typeof value==='string'&&value.startsWith('fbpi_')))return next();
  const state=typeof req.query.state==='string'?req.query.state:'';
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');let result='unavailable';
  try{if(req.params.platform==='facebook')result=await getRuntime().oauth.completePublicFlow({state,code:typeof req.query.code==='string'?req.query.code:undefined,error:typeof req.query.error==='string'?req.query.error:undefined,flowCookie:cookie(req)});}catch{/* no provider parameters in response/log */}
  res.clearCookie(invitationFlowCookie.name,{path:invitationFlowCookie.path,httpOnly:true,secure:true,sameSite:'lax'});
  const target=new URL('/facebook-page-import',origin);target.searchParams.set('result',result==='received'?'received':'unavailable');res.redirect(target.href);
 });
 router.post('/facebook-page-import-public/exchange',async(req,res,next)=>{try{
  if(req.headers.origin!==origin)throw new HttpError(403,'Invalid authorization origin');
  if(Buffer.byteLength(JSON.stringify(req.body??{}))>2048)throw new HttpError(413,'Authorization input too large');
  const input=z.object({secret:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().parse(req.body),rt=getRuntime();
  await rt.flows.rateLimit('ip:'+(req.ip??req.socket.remoteAddress??'unknown'),30);await rt.flows.rateLimit('invite:'+digestSecret(input.secret),5);await rt.maintain();
  const result=await rt.oauth.beginPublicFlow(input.secret,cookie(req));const url=new URL(result.authorizationUrl);
  if(url.protocol!=='https:'||url.hostname!=='www.facebook.com'||url.username||url.password||!url.pathname.endsWith('/dialog/oauth'))throw new HttpError(503,'Authorization unavailable');
  res.cookie(invitationFlowCookie.name,result.cookie.value,{path:invitationFlowCookie.path,maxAge:600000,httpOnly:true,secure:true,sameSite:'lax'});res.json({authorizationUrl:result.authorizationUrl});
 }catch(e){next(e);}});
 function action(run:(req:Request,ctx:InvitationContext,rt:PageImportRuntime)=>Promise<unknown>):RequestHandler{return async(req,res,next)=>{try{const ctx=context(req),rt=getRuntime();await rt.maintain();res.json(await run(req,ctx,rt));}catch(e){next(e);}};}
 const id=(req:Request)=>z.string().uuid().parse(req.params.inviteId);
 router.post(base,auth,action(async(req,ctx,rt)=>{const input=z.object({note:z.string().max(80).optional()}).strict().parse(req.body??{});await rt.flows.rateLimit('creator:'+ctx.userId,30);const result=await rt.service.create(ctx,input);return{view:result.view,shareUrl:origin+'/facebook-page-import#'+result.secret};}));
 router.get(base,auth,action((req,ctx,rt)=>{const q=z.object({cursor:z.string().max(2048).optional()}).strict().parse(req.query);return rt.service.list(ctx,q.cursor);}));
 router.get(base+'/:inviteId',auth,action((req,ctx,rt)=>rt.service.view(ctx,id(req))));
 router.post(base+'/:inviteId/confirm',auth,action((req,ctx,rt)=>{const input=z.object({pageIds:z.array(z.string().regex(/^\d{1,256}$/)).min(1).max(50)}).strict().parse(req.body);return rt.service.confirm(ctx,id(req),input.pageIds);}));
 router.post(base+'/:inviteId/complete-empty',auth,action((req,ctx,rt)=>{z.object({}).strict().parse(req.body??{});return rt.service.completeEmpty(ctx,id(req));}));
 router.post(base+'/:inviteId/revoke',auth,action((req,ctx,rt)=>{z.object({}).strict().parse(req.body??{});return rt.service.revoke(ctx,id(req));}));
 const errors:ErrorRequestHandler=(e,_req,res,_next)=>{const status=e instanceof z.ZodError?400:e instanceof HttpError?e.statusCode:typeof e.statusCode==='number'&&[401,403,413].includes(e.statusCode)?e.statusCode:503;res.status(status).json({message:status===429?'授权尝试过于频繁，请稍后再试。':'分享导入请求无法完成，请检查链接、当前身份或任务状态。'});};router.use(errors);return router;
}
