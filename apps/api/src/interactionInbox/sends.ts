import type {PrismaClient} from '@prisma/client';import {z} from 'zod';import {HttpError} from '../utils/errors';
import type {InboxAccess} from './access';import type {InboxRegistry} from './adapters/registry';import type {Scope,SendOutcome} from './types';
export function createInboxSends({access,registry}:{db:PrismaClient;access:InboxAccess;registry:InboxRegistry}){
 return{async replyToCase(ctx:Scope,id:string,input:unknown):Promise<SendOutcome>{
  const v=z.object({targetId:z.string().min(1).max(512),text:z.string().min(1).max(8000).refine(s=>!!s.trim()),requestKey:z.string().uuid()}).strict().parse(input);
  const {row,asset,source}=await access.resolveCase(ctx,id,'write');
  if(row.kind==='mentions')throw new HttpError(409,'This mention has no verified reply mapping');
  const expected=row.kind==='messages'?source.conversationId:source.commentId;
  if(!expected||expected!==v.targetId)throw new HttpError(404,'Reply target unavailable');
  if(v.text.length>(row.kind==='messages'?2000:8000))throw new HttpError(400,'Reply too long');
  await access.resolveInboxAsset(ctx,asset.accountId,`${row.kind}.reply` as any);
  return registry.getInboxAdapter(asset.platform).reply(asset,source,v.text,v.requestKey);
 }};
}
