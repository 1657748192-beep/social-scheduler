import {createHash} from 'node:crypto';
import {z} from 'zod';
import {HttpError} from '../utils/errors';
import type {PageContext} from './types';

const schema=z.object({
  userId:z.string().uuid(),workspaceId:z.string().uuid(),managedPageId:z.string().uuid(),
  appId:z.string().regex(/^\d{1,256}$/),pageId:z.string().regex(/^\d{1,256}$/),
  connectionId:z.string().uuid(),connectionVersion:z.number().int().positive(),
  conversationId:z.string().min(1).max(512).regex(/^[a-zA-Z0-9_: .\-]+$/),
  participantId:z.string().regex(/^\d{1,256}$/),textSha256:z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt:z.string().datetime(),
}).strict();
export type FacebookReplyTestRestriction=z.infer<typeof schema>;
/** Invalid configured restrictions must stop startup, never fall back to unrestricted. */
export function parseFacebookReplyTestRestriction(value:string|undefined):FacebookReplyTestRestriction|null{
  if(value===undefined)return null;
  if(value.length>8192)throw new Error('Invalid Facebook reply test restriction');
  try{return Object.freeze(schema.parse(JSON.parse(value)));}catch{throw new Error('Invalid Facebook reply test restriction');}
}
export function copyReplyTestRestriction(value:FacebookReplyTestRestriction|null|undefined){
  return value==null?null:Object.freeze(schema.parse(value));
}
export function assertReplyTestContext(rule:FacebookReplyTestRestriction|null,ctx:PageContext,at=new Date()){
  if(rule&&(at.getTime()>=Date.parse(rule.expiresAt)||ctx.userId!==rule.userId||ctx.workspaceId!==rule.workspaceId||ctx.managedPageId!==rule.managedPageId))throw new HttpError(403,'Controlled Facebook reply test is unavailable');
}
export function assertReplyTestGrant(rule:FacebookReplyTestRestriction|null,access:{appId:string;pageId:string;connectionId:string;connectionVersion:number}){
  if(rule&&(access.appId!==rule.appId||access.pageId!==rule.pageId||access.connectionId!==rule.connectionId||access.connectionVersion!==rule.connectionVersion))throw new HttpError(403,'Controlled Facebook authorization changed');
}
export function assertReplyTestInput(rule:FacebookReplyTestRestriction|null,input:{kind:string;targetId?:string;conversationId?:string;text:string}){
  if(rule&&(input.kind!=='message'||input.targetId!==undefined&&input.targetId!==rule.participantId||input.conversationId!==undefined&&input.conversationId!==rule.conversationId||createHash('sha256').update(input.text).digest('hex')!==rule.textSha256))throw new HttpError(403,'Reply is outside the controlled Facebook test');
}
