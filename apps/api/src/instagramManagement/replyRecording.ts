import {createHash} from 'node:crypto';
import {z} from 'zod';
import {HttpError} from '../utils/errors';
import type {InboxDb} from '../interactionInbox/access';
import type {ResolvedAsset,SourceRef} from '../interactionInbox/types';
import {parseInboxSource} from '../interactionInbox/source';

export const recordingTexts=Object.freeze({
 comment:'Social Scheduler Instagram comment reply test REC1. This reply is for app review demonstration only.',
 message:'Social Scheduler Instagram messaging reply test REC1. This reply is for app review demonstration only.',
});
const id=z.string().regex(/^[-a-zA-Z0-9_:.]{1,256}$/),target={sourceRecordId:z.string().uuid(),providerEventId:id,actorId:id};
const schema=z.object({enabled:z.literal(true),userId:z.string().uuid(),workspaceId:z.string().uuid(),accountId:z.string().uuid(),appId:z.string().regex(/^\d{1,256}$/),providerAccountId:z.string().regex(/^\d{1,256}$/),connectionId:z.string().uuid(),connectionVersion:z.number().int().positive(),username:z.literal('mooyamcosmetic'),expiresAt:z.string().datetime(),comment:z.object({...target,mediaId:id}).strict(),message:z.object({...target,conversationId:id}).strict()}).strict();
export type InstagramReplyRecording=z.infer<typeof schema>;
export function copyInstagramReplyRecording(value:InstagramReplyRecording|null|undefined){
 if(value==null)return null;
 const rule=schema.parse(value);Object.freeze(rule.comment);Object.freeze(rule.message);return Object.freeze(rule);
}
/** An absent setting leaves the existing send gate untouched; invalid settings never open access. */
export function parseInstagramReplyRecording(value:string|undefined){
 if(value===undefined)return null;
 try{if(value.length>8192)throw Error();return copyInstagramReplyRecording(schema.parse(JSON.parse(value)))!;}catch{throw new Error('Invalid Instagram reply recording configuration');}
}
export const recordingTargetHash=(kind:'message'|'comment',targetId:string)=>createHash('sha256').update(JSON.stringify([kind,targetId])).digest('hex');
export async function requireInstagramRecordingTarget(db:InboxDb,rule:InstagramReplyRecording,a:ResolvedAsset,value:SourceRef|undefined,text?:string,at=new Date(),allowExpired=false){
 const deny=()=>new HttpError(403,'Controlled Instagram reply recording unavailable');
 const s=parseInboxSource(value,'instagram');
 if(a.platform!=='instagram'||a.ctx.userId!==rule.userId||a.ctx.workspaceId!==rule.workspaceId||a.accountId!==rule.accountId||a.appNamespace!==rule.appId||a.providerAssetId!==rule.providerAccountId||a.connectionVersion!==rule.connectionVersion||s.connectionId!==rule.connectionId||s.connectionVersion!==rule.connectionVersion||s.instagramAccountId!==rule.accountId||a.sourceRef?.connectionId!==rule.connectionId||!allowExpired&&at.getTime()>=Date.parse(rule.expiresAt))throw deny();
 const kind:'message'|'comment'=s.conversationId?'message':'comment',r=rule[kind];
 if(s.sourceRecordId!==r.sourceRecordId||(kind==='message'?s.conversationId!==rule.message.conversationId||s.participantId!==r.actorId: s.commentId!==r.providerEventId||s.mediaId!==rule.comment.mediaId)||text!==undefined&&text!==recordingTexts[kind])throw deny();
 const account=await db.socialAccount.findFirst({where:{id:rule.accountId,workspaceId:rule.workspaceId,platform:'instagram',providerAccountId:rule.providerAccountId,status:'active'},select:{capabilities:true}});
 const profile=account?.capabilities;
 if(!profile||typeof profile!=='object'||Array.isArray(profile)||profile.profileUsername!==rule.username)throw deny();
 const where={id:r.sourceRecordId,workspaceId:rule.workspaceId,connectionId:rule.connectionId,connectionVersion:rule.connectionVersion,providerId:r.providerEventId,actorId:r.actorId,inbound:true,deleted:false};
 const row=kind==='message'?await db.instagramInteractionMessage.findFirst({where:{...where,conversationId:rule.message.conversationId}}):await db.instagramInteractionComment.findFirst({where:{...where,mediaId:rule.comment.mediaId}});
 const marker=kind==='message'?'SS-IG-DM-1022-REC1':'SS-IG-C-1022-REC1';
 if(!row?.text||!new RegExp('^'+marker+'(?:\\s|$)').test(row.text))throw deny();
 return{kind,targetId:kind==='message'?r.actorId:r.providerEventId};
}
