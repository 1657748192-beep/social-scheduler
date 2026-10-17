import {z} from 'zod';
import type {MetaPlatform} from './livePolicy';
const id=z.string().min(1).max(256);
const common={connectionId:z.string().uuid(),connectionVersion:z.number().int().positive(),conversationId:id.optional(),commentId:id.optional(),participantId:id.optional(),sourceRecordId:z.string().uuid().optional()};
export const facebookSourceSchema=z.object({...common,platform:z.literal('facebook'),managedPageId:z.string().uuid(),scheduleId:z.string().uuid().optional(),postId:id.optional()}).strict();
export const instagramSourceSchema=z.object({...common,platform:z.literal('instagram'),instagramAccountId:z.string().uuid(),mediaId:id.optional()}).strict();
export type FacebookInboxSource=z.infer<typeof facebookSourceSchema>;
export type InstagramInboxSource=z.infer<typeof instagramSourceSchema>;
export type MetaInboxSource=FacebookInboxSource|InstagramInboxSource;
export function parseInboxSource(value:unknown,platform:'facebook'):FacebookInboxSource;
export function parseInboxSource(value:unknown,platform:'instagram'):InstagramInboxSource;
export function parseInboxSource(value:unknown,platform:MetaPlatform):MetaInboxSource;
export function parseInboxSource(value:unknown,platform:MetaPlatform):MetaInboxSource{
 if(platform==='facebook'){
  const payload=z.record(z.unknown()).parse(value);
  return facebookSourceSchema.parse(payload.platform===undefined?{...payload,platform:'facebook'}:payload);
 }
 return instagramSourceSchema.parse(value);
}
