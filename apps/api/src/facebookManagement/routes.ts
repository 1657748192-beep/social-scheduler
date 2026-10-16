import {Router,type Request,type RequestHandler,type ErrorRequestHandler} from 'express';
import {z,ZodError} from 'zod';
import {randomUUID} from 'node:crypto';
import {requireAuth} from '../middleware/auth';
import {HttpError} from '../utils/errors';
import {FacebookPageAccessError} from './access';
import {ManagementAuthorizationError} from './store';
import {FacebookSendInputError} from './sendAttempts';
import {FacebookDirectoryError} from './graphDirectory';
import type {FacebookManagementRuntime} from './runtime';
import type {ManagementContext,PageContext} from './types';

const uuid=z.string().uuid(),cursor=z.string().min(1).max(2048).refine(s=>!/[\x00-\x20\x7f]/.test(s)).optional();
const reply=(max:number)=>z.object({requestKey:uuid,text:z.string().min(1).max(max).refine(s=>Boolean(s.trim()))}).strict();
const identifier=z.string().regex(/^[a-zA-Z0-9_.:-]{1,256}$/);
export function createFacebookManagementRouter(runtime:FacebookManagementRuntime,options:{authenticate?:RequestHandler;webAppUrl:string}){
  const router=Router(),authenticate=options.authenticate??requireAuth,base='/workspaces/:workspaceId/facebook-management';
  router.get('/integrations/facebook-management/oauth/callback',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    let result='failed';
    try{if(runtime.enabled){await runtime.oauth.callback({state:typeof req.query.state==='string'?req.query.state:'',code:typeof req.query.error==='string'?'':typeof req.query.code==='string'?req.query.code:''});result='connected';}}catch{/* Never echo provider parameters or credentials. */}
    const target=new URL('/facebook-management',options.webAppUrl);target.searchParams.set('facebook_management',result);res.redirect(target.href);
  });
  function context(req:Request):ManagementContext{
    if(!req.user?.sessionId)throw new HttpError(401,'Authentication required');
    return {userId:req.user.id,sessionId:req.user.sessionId,workspaceId:uuid.parse(req.params.workspaceId)};
  }
  const page=(req:Request,ctx:ManagementContext):PageContext=>({...ctx,managedPageId:uuid.parse(req.params.managedPageId)});
  function route(method:'get'|'post',path:string,mode:'status'|'read'|'write'|'manage',action:(req:Request,ctx:ManagementContext)=>Promise<unknown>){
    router[method](base+path,authenticate,async(req,res,next)=>{
      res.setHeader('Cache-Control','no-store');
      try{
        const ctx=context(req),member=await runtime.member(ctx);
        if(mode!=='status'&&!runtime.enabled)throw new HttpError(404,'Facebook management is not enabled');
        if(mode==='manage'&&!['owner','admin'].includes(member.role)||mode==='write'&&!['owner','admin','editor'].includes(member.role))throw new HttpError(403,'Workspace role cannot perform this action');
        res.json(await action(req,ctx));
      }catch(error){next(error);}
    });
  }
  route('get','/status','status',async()=>({enabled:runtime.enabled,configured:runtime.configured}));
  route('post','/oauth/start','manage',async(req,ctx)=>{const input=z.object({connectionId:uuid.optional()}).strict().parse(req.body??{});return runtime.oauth.start(ctx,input.connectionId);});
  route('get','/connections','read',async(_req,ctx)=>runtime.connections(ctx));
  route('post','/connections/:connectionId/disconnect','manage',async(req,ctx)=>runtime.disconnect(ctx,uuid.parse(req.params.connectionId)));
  route('post','/connections/:connectionId/refresh','manage',async(req,ctx)=>runtime.directory.refresh(ctx,uuid.parse(req.params.connectionId),{force:true}));
  route('get','/pages','read',async(req,ctx)=>runtime.directory.list(ctx,z.object({connectionId:uuid.optional(),businessId:z.string().regex(/^\d{1,256}$/).optional(),query:z.string().max(200).optional(),cursor}).strict().parse(req.query)));
  route('post','/pages/:managedPageId/select','manage',async(req,ctx)=>runtime.directory.select(ctx,uuid.parse(req.params.managedPageId)));
  route('get','/pages/:managedPageId/capabilities','read',async(req,ctx)=>runtime.engagement.capabilities(page(req,ctx)));
  route('get','/pages/:managedPageId/notifications/status','read',async(req,ctx)=>runtime.notifications.status(page(req,ctx)));
  route('post','/pages/:managedPageId/notifications/enable','manage',async(req,ctx)=>runtime.notifications.enableNotifications(page(req,ctx)));
  route('get','/pages/:managedPageId/conversations','read',async(req,ctx)=>runtime.engagement.conversations(page(req,ctx),cursor.parse(req.query.cursor)));
  route('get','/pages/:managedPageId/conversations/:conversationId/messages','read',async(req,ctx)=>runtime.engagement.messages(page(req,ctx),identifier.parse(req.params.conversationId),cursor.parse(req.query.cursor)));
  route('post','/pages/:managedPageId/conversations/:conversationId/replies','write',async(req,ctx)=>runtime.engagement.replyMessage(page(req,ctx),{...reply(2000).parse(req.body),conversationId:identifier.parse(req.params.conversationId)}));
  route('get','/pages/:managedPageId/posts/:scheduleId/comments','read',async(req,ctx)=>runtime.engagement.comments(page(req,ctx),uuid.parse(req.params.scheduleId),cursor.parse(req.query.cursor)));
  route('post','/pages/:managedPageId/posts/:scheduleId/comments/:commentId/replies','write',async(req,ctx)=>runtime.engagement.replyComment(page(req,ctx),{...reply(8000).parse(req.body),scheduleId:uuid.parse(req.params.scheduleId),commentId:identifier.parse(req.params.commentId)}));
  const errors:ErrorRequestHandler=(error,_req,res,_next)=>{
    let status=500,message='Facebook management unavailable';
    if(error instanceof ZodError){status=400;message='Invalid Facebook management request';}
    else if(error instanceof HttpError){status=error.statusCode;message=error.message;}
    else if(error instanceof FacebookPageAccessError){status=error.status;message=error.message;}
    else if(error instanceof FacebookSendInputError){status=error.statusCode;message=error.message;}
    else if(error instanceof ManagementAuthorizationError){status=403;message=error.message;}
    else if(error instanceof FacebookDirectoryError){status=502;message=`Facebook ${error.kind}`;}
    if(!res.headersSent)res.status(status).json({message,diagnosticId:randomUUID()});
  };
  router.use(errors);return router;
}
