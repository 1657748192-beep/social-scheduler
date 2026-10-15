import {Router,type Request} from 'express';
import {requireAuth} from '../../middleware/auth';
import {asyncHandler} from '../../utils/asyncHandler';
import {HttpError} from '../../utils/errors';
import {config} from '../../config';
import {CHUNK_THRESHOLD_BYTES,MAX_FILE_BYTES,PART_SIZE_BYTES} from './protocol';
import {getOwnedSession,getUploadView,initSession,requireUploadWriteAccess} from './sessions';
import {acceptPart,acceptThumbnail,type ChunkDeps} from './parts';
import {completeUpload} from './complete';

const base='/workspaces/:workspaceId/media';
const actor=(req:Request)=>({userId:req.user!.id,workspaceId:req.params.workspaceId});
function streamSignal(req:Request){const controller=new AbortController();const abort=()=>controller.abort();req.once('aborted',abort);if(req.aborted)abort();return {signal:controller.signal,dispose:()=>req.off('aborted',abort)};}
export function createLocalUploadRouter(deps:ChunkDeps){
 const router=Router();router.use(base,requireAuth);
 router.get(base+'/upload-capabilities',asyncHandler(async(req,res)=>{
  await requireUploadWriteAccess(deps.db,actor(req));
  res.json({protocol:config.MEDIA_STORAGE==='local'?'local-chunks-v1':null,ownerUserId:req.user!.id,partSizeBytes:PART_SIZE_BYTES,thresholdBytes:CHUNK_THRESHOLD_BYTES,maxFileBytes:MAX_FILE_BYTES});
 }));
 router.post(base+'/upload-sessions',asyncHandler(async(req,res)=>{if(config.MEDIA_STORAGE!=='local')throw new HttpError(404,'Local uploads unavailable');res.status(201).json(await initSession(deps,actor(req),req.body));}));
 router.get(base+'/upload-sessions/:id',asyncHandler(async(req,res)=>{
  const session=await getOwnedSession(deps,actor(req),req.params.id);
  const parts=await deps.db.localUploadPart.findMany({where:{sessionId:session.id},select:{index:true}});
  res.json(getUploadView(session,parts.map(p=>p.index)));
 }));
 router.put(base+'/upload-sessions/:id/parts/:index',asyncHandler(async(req,res)=>{
  if(!/^(0|[1-9][0-9]{0,2})$/.test(req.params.index))throw new HttpError(400,'Invalid part index');
  const input=streamSignal(req);try{res.json(await acceptPart(deps,actor(req),req.params.id,Number(req.params.index),req,input.signal));}finally{input.dispose();}
 }));
 router.put(base+'/upload-sessions/:id/thumbnail',asyncHandler(async(req,res)=>{
  const input=streamSignal(req);try{res.json(await acceptThumbnail(deps,actor(req),req.params.id,req,input.signal));}finally{input.dispose();}
 }));
 router.post(base+'/upload-sessions/:id/complete',asyncHandler(async(req,res)=>{
  try{res.json(await completeUpload(deps,actor(req),req.params.id));}
  catch(e){if(e instanceof HttpError&&e.statusCode===409)res.setHeader('Retry-After','2');throw e;}
 }));
 router.delete(base+'/upload-sessions/:id',asyncHandler(async(req,_res)=>{
  await getOwnedSession(deps,actor(req),req.params.id);throw new HttpError(501,'Upload operation is not enabled yet');
 }));
 return router;
}
