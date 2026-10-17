import {Router,type Request,type RequestHandler,type ErrorRequestHandler} from 'express';import {z} from 'zod';
import {requireAuth} from '../middleware/auth';import {HttpError} from '../utils/errors';import type {InboxRuntime} from './runtime';import type {Scope} from './types';import {parseQuery,uuid} from './limits';
export function createInteractionInboxRouter(runtime:InboxRuntime,options:{authenticate?:RequestHandler}={}){
 const router=Router(),base='/workspaces/:workspaceId/interaction-inbox';
 function context(req:Request):Scope{if(!req.user?.sessionId)throw new HttpError(401,'Authentication required');return{userId:req.user.id,sessionId:req.user.sessionId,workspaceId:uuid.parse(req.params.workspaceId)};}
 router.use(base,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();},options.authenticate??requireAuth,async(req,_res,next)=>{try{await runtime.access.require(context(req),req.method==='GET'?'read':'write');next();}catch(e){next(e);}});
 function query(req:Request){
  const raw=z.object({accountIds:z.string().min(1).max(2000),kind:z.enum(['comments','messages','mentions']),status:z.string().optional(),unread:z.enum(['true','false']).optional(),tagIds:z.string().optional(),from:z.string().optional(),to:z.string().optional(),q:z.string().optional(),searchMessages:z.enum(['true','false']).optional(),cursor:z.string().optional(),limit:z.string().regex(/^\d{1,2}$/).optional()}).strict().parse(req.query);
  return parseQuery({...raw,accountIds:raw.accountIds.split(','),tagIds:raw.tagIds?.split(','),limit:raw.limit?Number(raw.limit):undefined,searchMessages:raw.searchMessages==='true',unread:raw.unread===undefined?undefined:raw.unread==='true'});
 }
 const action=(f:(req:Request,ctx:Scope)=>Promise<unknown>):RequestHandler=>async(req,res,next)=>{try{res.json(await f(req,context(req)));}catch(e){next(e);}};
 const id=(req:Request)=>uuid.parse(req.params.id);
 router.get(base+'/accounts',action((req,ctx)=>runtime.directory.listInboxAccounts(ctx,z.object({platform:z.string().optional(),q:z.string().optional(),cursor:z.string().optional()}).strict().parse(req.query))));
 router.get(base+'/assignees',action((_req,ctx)=>runtime.assignees(ctx)));
 router.get(base+'/capabilities',action(async(req,ctx)=>{
  if(!req.query.accountIds)return{accounts:[],authorizationEnabled:false};const ids=z.string().max(2000).parse(req.query.accountIds).split(',');z.array(uuid).min(1).max(50).parse(ids);
  const accounts=[];for(const accountId of ids){try{const a=await runtime.access.resolveInboxAsset(ctx,accountId);accounts.push({accountId,capabilities:await runtime.registry.getInboxAdapter(a.platform).capabilities(a)});}catch{accounts.push({accountId,capabilities:[],reason:'verification_unavailable'});}}await runtime.access.require(ctx);return{accounts,authorizationEnabled:false};
 }));
 router.get(base+'/cases',action((req,ctx)=>runtime.reads.listCases(ctx,query(req))));
 router.get(base+'/cases/:id',action((req,ctx)=>runtime.reads.getCase(ctx,id(req),query(req))));
 router.post(base+'/refresh',action(async(req,ctx)=>{const result=await runtime.reception.refreshInbox(ctx,req.body);await runtime.retention.pruneInbox(new Date(),50);return result;}));
 router.post(base+'/cases/batch',action(async(req,ctx)=>{const body=z.object({operations:z.array(z.unknown()).max(50)}).strict().parse(req.body);return runtime.cases.batchCases(ctx,body.operations);}));
 router.patch(base+'/cases/:id',action((req,ctx)=>runtime.cases.updateCase(ctx,id(req),req.body)));
 router.post(base+'/cases/:id/read',action((req,ctx)=>runtime.cases.markRead(ctx,id(req),req.body)));
 router.post(base+'/cases/:id/replies',action((req,ctx)=>runtime.sends.replyToCase(ctx,id(req),req.body)));
 router.post(base+'/cases/:id/send-check',action((req,ctx)=>runtime.sends.acknowledgeSend(ctx,id(req),req.body)));
 router.get(base+'/customers/:id',action((req,ctx)=>runtime.customers.getCustomer(ctx,id(req))));
 router.get(base+'/customers/:id/notes',action(async(req,ctx)=>(await runtime.customers.getCustomer(ctx,id(req))).notes));
 router.delete(base+'/customers/:id',action(async(req,ctx)=>{const v=z.object({version:z.number().int().positive()}).strict().parse(req.body);await runtime.customers.deleteCustomer(ctx,id(req),v.version);return{deleted:true};}));
 router.post(base+'/customers/:id/notes',action((req,ctx)=>runtime.customers.saveNote(ctx,id(req),z.object({text:z.string()}).strict().parse(req.body).text)));
 router.delete(base+'/customers/:id/notes/:noteId',action(async(req,ctx)=>{await runtime.customers.deleteNote(ctx,id(req),uuid.parse(req.params.noteId));return{deleted:true};}));
 router.get(base+'/tags',action((_req,ctx)=>runtime.labels.listTags(ctx)));
 router.post(base+'/tags',action((req,ctx)=>runtime.labels.mutateTag(ctx,{...z.object({kind:z.enum(['customer','case']),name:z.string(),color:z.string()}).strict().parse(req.body),op:'create'})));
 router.patch(base+'/tags/:id',action((req,ctx)=>runtime.labels.mutateTag(ctx,{...z.object({name:z.string(),color:z.string(),version:z.number().int().positive()}).strict().parse(req.body),id:id(req),op:'rename'})));
 router.delete(base+'/tags/:id',action((req,ctx)=>runtime.labels.mutateTag(ctx,{...z.object({version:z.number().int().positive()}).strict().parse(req.body),id:id(req),op:'delete'})));
 for(const target of ['customers','cases'] as const)router.put(base+`/${target}/:id/tags`,action(async(req,ctx)=>{const v=z.object({tagIds:z.array(uuid).max(10),version:z.number().int().positive()}).strict().parse(req.body);await runtime.labels.setTags(ctx,{kind:target==='customers'?'customer':'case',id:id(req)},v.tagIds,v.version);return{saved:true};}));
 const errors:ErrorRequestHandler=(e,_req,res,_next)=>{const status=e instanceof z.ZodError?400:e instanceof HttpError?e.statusCode:503;if(status===429)res.setHeader('Retry-After','30');res.setHeader('Cache-Control','no-store');res.status(status).json({message:status===403?'Interaction inbox access denied':'Interaction inbox request could not be completed',details:{code:status===409?'version_or_capability_conflict':status===429?'rate_limited':status===404?'unavailable':status===400?'invalid_request':'inbox_unavailable'}});};router.use(errors);return router;
}
