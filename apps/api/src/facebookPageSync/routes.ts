import {Router,type RequestHandler,type ErrorRequestHandler,type Request} from 'express';
import {z} from 'zod';
import {requireAuth} from '../middleware/auth';
import {HttpError} from '../utils/errors';
import {isPageSyncNamespace} from './store';
import type {createFacebookPageSyncService} from './service';
import type {SyncContext} from './types';
const uuid=z.string().uuid(),syncId=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export function createFacebookPageSyncRouter(service:()=>ReturnType<typeof createFacebookPageSyncService>,options:{webAppUrl:string;authenticate?:RequestHandler}){
 const router=Router(),auth=options.authenticate??requireAuth,base='/workspaces/:workspaceId/facebook-page-sync';
 router.get('/integrations/:platform/oauth/callback',async(req,res,next)=>{
  const state=typeof req.query.state==='string'?req.query.state:'';if(!isPageSyncNamespace(state))return next();
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  const target=new URL('/social-accounts',options.webAppUrl);
  try{
   if(req.params.platform!=='facebook')throw new HttpError(400,'Invalid sync platform');
   const completed=await service().callback({state,code:typeof req.query.code==='string'?req.query.code:undefined,error:typeof req.query.error==='string'?req.query.error:undefined});
   target.searchParams.set('facebookPageSync',completed.syncId);target.searchParams.set('syncWorkspace',completed.workspaceId);
  }catch{target.searchParams.set('facebookPageSync','failed');}
  res.redirect(target.href);
 });
 function context(req:Request):SyncContext{if(!req.user?.sessionId)throw new HttpError(401,'Authentication required');return{userId:req.user.id,sessionId:req.user.sessionId,workspaceId:uuid.parse(req.params.workspaceId)};}
 const action=(run:(req:Request,ctx:SyncContext)=>Promise<unknown>):RequestHandler=>async(req,res,next)=>{res.setHeader('Cache-Control','no-store');try{res.json(await run(req,context(req)));}catch(e){next(e);}};
 router.use(base,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 router.post(base+'/start',auth,action(async(req,ctx)=>{z.object({}).strict().parse(req.body??{});return service().start(ctx);}));
 router.get(base+'/:syncId',auth,action((req,ctx)=>service().view(ctx,syncId.parse(req.params.syncId))));
 router.post(base+'/:syncId/confirm',auth,action((req,ctx)=>{const input=z.object({pageIds:z.array(z.string().regex(/^\d{1,256}$/)).min(1).max(50)}).strict().parse(req.body);return service().confirm(ctx,syncId.parse(req.params.syncId),input.pageIds);}));
 router.delete(base+'/:syncId',auth,action(async(req,ctx)=>{await service().cancel(ctx,syncId.parse(req.params.syncId));return{cancelled:true};}));
 const errors:ErrorRequestHandler=(error,_req,res,_next)=>{const status=error instanceof z.ZodError?400:error instanceof HttpError?error.statusCode:503;res.status(status).json({message:'Public Page sync request could not be completed',details:{code:status===401?'session_expired':status===403?'sync_forbidden':status===410?'sync_expired':status===409?'sync_conflict':status===400?'sync_invalid':'sync_unavailable'}});};
 router.use(errors);return router;
}
