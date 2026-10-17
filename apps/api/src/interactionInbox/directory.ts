import type {PrismaClient} from '@prisma/client';import {z} from 'zod';
import type {InboxAccess} from './access';import type {AccountDto,PageResult,Scope} from './types';
import {capabilities,platforms} from './types';import {encodeInboxCursor,decodeInboxCursor} from './cursor';
export function safeInboxUrl(value:unknown):string|null{
 if(typeof value!=='string'||value.length>4096)return null;
 try{const u=new URL(value);const domains=['facebook.com','fbcdn.net','instagram.com','cdninstagram.com','tiktok.com','tiktokcdn.com','tiktokcdn-us.com','tiktokcdn-eu.com','youtube.com','ytimg.com','ggpht.com','googleusercontent.com','pinterest.com','pinimg.com'];return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d))?u.href:null;}catch{return null;}
}
export function createInboxDirectory({db,access}:{db:PrismaClient;access:InboxAccess}){
 return{async listInboxAccounts(ctx:Scope,input:{platform?:string;q?:string;cursor?:string;limit?:number}):Promise<PageResult<AccountDto>>{
  await access.require(ctx);const q=z.object({platform:z.enum(platforms).optional(),q:z.string().trim().min(1).max(100).optional(),cursor:z.string().max(2048).optional(),limit:z.number().int().min(1).max(50).default(50)}).strict().parse(input);
  const scope={ctx,platform:q.platform??null,q:q.q??null},after=q.cursor?decodeInboxCursor(scope,q.cursor).after:null;
  const rows=await db.socialAccount.findMany({where:{workspaceId:ctx.workspaceId,platform:q.platform as any??{in:[...platforms]},...(q.q?{displayName:{contains:q.q,mode:'insensitive' as const}}:{}),...(typeof after==='string'?{id:{gt:after}}:{})},orderBy:{id:'asc'},take:q.limit+1,select:{id:true,platform:true,displayName:true,avatarUrl:true,status:true}});
  const items:AccountDto[]=rows.slice(0,q.limit).filter(r=>platforms.includes(r.platform as any)).map(r=>({id:r.id,platform:r.platform as any,name:r.displayName,avatarUrl:safeInboxUrl(r.avatarUrl),publishingStatus:r.status,capabilities:capabilities.map(capability=>({capability,available:false,reason:r.platform==='facebook'?'verification_required':'not_integrated',verifiedAt:null}))}));
  await access.require(ctx);return{items,nextCursor:rows.length>q.limit?encodeInboxCursor(scope,{after:rows[q.limit-1].id}):null,accountsStatus:[],partial:false,observedAt:new Date().toISOString(),lastSuccessfulSyncAt:null};
 }};
}
