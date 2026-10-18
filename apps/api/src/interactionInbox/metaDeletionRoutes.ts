import express,{type ErrorRequestHandler} from 'express';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {HttpError} from '../utils/errors';
export type MetaDeletionNamespace={platform:'facebook'|'instagram';appId:string};
declare const verifiedDeletion:unique symbol;
export type VerifiedMetaDeletionProof={userId:string;issuedAt:number;readonly[verifiedDeletion]:true};
/** Verifies the original encoded payload, never a reserialized frontend object. */
export function verifyMetaSignedRequest(value:string,secret:string):VerifiedMetaDeletionProof{
 try{
  if(typeof value!=='string'||value.length>32000||secret.length<16)throw Error();
  const parts=value.split('.');if(parts.length!==2||parts.some(v=>!/^[a-zA-Z0-9_-]+={0,2}$/.test(v)))throw Error();
  const [signature,payload]=parts,bytes=Buffer.from(signature,'base64url'),expected=createHmac('sha256',secret).update(payload).digest();
  if(bytes.length!==expected.length||!timingSafeEqual(bytes,expected)||bytes.toString('base64url')!==signature.replace(/=+$/,''))throw Error();
  const raw=Buffer.from(payload,'base64url');if(raw.toString('base64url')!==payload.replace(/=+$/,''))throw Error();
  const p=JSON.parse(raw.toString('utf8')),now=Math.floor(Date.now()/1000);
  if(p.algorithm!=='HMAC-SHA256'||typeof p.user_id!=='string'||!/^\d{1,256}$/.test(p.user_id)||!Number.isSafeInteger(p.issued_at)||p.issued_at<1||p.issued_at>now+300||p.issued_at<now-7*86400)throw Error();
  return{userId:p.user_id,issuedAt:p.issued_at} as VerifiedMetaDeletionProof;
 }catch{throw new HttpError(403,'Invalid Meta deletion request');}
}
type Deletion={requestUserDeletion:(namespace:MetaDeletionNamespace,proof:VerifiedMetaDeletionProof,reason:'data_deletion'|'deauthorization')=>Promise<{confirmationCode:string}>};
export function createMetaDeletionRouter({namespace,secret,statusBaseUrl,deletion,statusStore,verifySignedRequest=verifyMetaSignedRequest}:{namespace:MetaDeletionNamespace;secret:string;statusBaseUrl:string;deletion:Deletion;statusStore:{status:(code:string)=>Promise<'pending'|'completed'|null>};verifySignedRequest?:typeof verifyMetaSignedRequest}){
 const base=new URL(statusBaseUrl);
 if(!['facebook','instagram'].includes(namespace.platform)||!/^\d{1,256}$/.test(namespace.appId)||secret.length<16||base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new Error('Meta deletion configuration unavailable');
 const router=express.Router();router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next();});
 router.use(express.urlencoded({extended:false,limit:'32kb',parameterLimit:10}));
 for(const [path,reason]of [['/data-deletion','data_deletion'],['/deauthorize','deauthorization']] as const)router.post(path,async(req,res)=>{
  let proof:VerifiedMetaDeletionProof;
  try{proof=verifySignedRequest(req.body?.signed_request,secret);}catch{res.status(403).json({message:'Invalid Meta deletion request'});return;}
  try{
   const result=await deletion.requestUserDeletion({...namespace},proof,reason);
   if(!/^[a-zA-Z0-9_-]{32,128}$/.test(result.confirmationCode))throw Error();
   if(reason==='deauthorization'){res.json({accepted:true});return;}
   res.json({url:base.toString().replace(/\/$/,'')+'/'+result.confirmationCode,confirmation_code:result.confirmationCode});
  }catch{res.status(503).json({message:'Meta deletion request unavailable'});}
 });
 router.get('/status/:code',async(req,res)=>{
  if(!/^[a-zA-Z0-9_-]{32,128}$/.test(req.params.code)){res.status(404).json({message:'Deletion status unavailable'});return;}
  try{const status=await statusStore.status(req.params.code);if(status!=='pending'&&status!=='completed'){res.status(404).json({message:'Deletion status unavailable'});return;}res.json({status});}catch{res.status(503).json({message:'Deletion status unavailable'});}
 });
 const errors:ErrorRequestHandler=(error,_req,res,_next)=>{res.status(error?.type==='entity.too.large'?413:400).json({message:'Invalid Meta deletion request'});};router.use(errors);
 return router;
}
