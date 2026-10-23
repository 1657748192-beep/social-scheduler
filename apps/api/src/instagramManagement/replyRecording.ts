import {createHash} from 'node:crypto';
import {z} from 'zod';
import {HttpError} from '../utils/errors';
import type {InboxDb} from '../interactionInbox/access';
import type {ResolvedAsset,SourceRef} from '../interactionInbox/types';
import {parseInboxSource} from '../interactionInbox/source';
import {REC3_MARKER,REC3_TEXT} from './recordingGrantIdentity';

export const recordingTexts=Object.freeze({
 comment:'Social Scheduler Instagram comment reply test REC1. This reply is for app review demonstration only.',
 message:'Social Scheduler Instagram messaging reply test REC1. This reply is for app review demonstration only.',
});
const id=z.string().regex(/^[-a-zA-Z0-9_:.]{1,256}$/),target={sourceRecordId:z.string().uuid(),providerEventId:id,actorId:id};
const schema=z.object({enabled:z.literal(true),userId:z.string().uuid(),workspaceId:z.string().uuid(),accountId:z.string().uuid(),appId:z.string().regex(/^\d{1,256}$/),providerAccountId:z.string().regex(/^\d{1,256}$/),connectionId:z.string().uuid(),connectionVersion:z.number().int().positive(),username:z.literal('mooyamcosmetic'),expiresAt:z.string().datetime(),messageRec3:z.object({...target,conversationId:id,expiresAt:z.string().datetime()}).strict().optional(),messageRec2:z.object({...target,conversationId:id,expiresAt:z.string().datetime()}).strict().optional(),commentRec2:z.object({...target,mediaId:id,expiresAt:z.string().datetime()}).strict().optional(),comment:z.object({...target,mediaId:id}).strict(),message:z.object({...target,conversationId:id}).strict()}).strict();
export type InstagramReplyRecording=z.infer<typeof schema>;
export function copyInstagramReplyRecording(value:InstagramReplyRecording|null|undefined){
 if(value==null)return null;
 const rule=schema.parse(value);Object.freeze(rule.comment);Object.freeze(rule.message);if(rule.commentRec2)Object.freeze(rule.commentRec2);if(rule.messageRec2)Object.freeze(rule.messageRec2);if(rule.messageRec3)Object.freeze(rule.messageRec3);return Object.freeze(rule);
}
/** An absent setting leaves the existing send gate untouched; invalid settings never open access. */
export function parseInstagramReplyRecording(value:string|undefined){
 if(value===undefined)return null;
 try{if(value.length>8192)throw Error();return copyInstagramReplyRecording(schema.parse(JSON.parse(value)))!;}catch{throw new Error('Invalid Instagram reply recording configuration');}
}
export const recordingTargetHash=(kind:'message'|'comment',targetId:string)=>createHash('sha256').update(JSON.stringify([kind,targetId])).digest('hex');
export function instagramRecordingSelection(rule:InstagramReplyRecording,s:SourceRef){
 const kind=s.conversationId?'message':'comment',nextComment=kind==='comment'&&rule.commentRec2?.sourceRecordId===s.sourceRecordId,nextMessage=kind==='message'&&rule.messageRec2?.sourceRecordId===s.sourceRecordId,nextThird=kind==='message'&&rule.messageRec3?.sourceRecordId===s.sourceRecordId;
 const record=nextThird?rule.messageRec3!:nextMessage?rule.messageRec2!:nextComment?rule.commentRec2!:rule[kind];
 return{kind:kind as 'message'|'comment',record,text:nextThird?REC3_TEXT:nextMessage?'Social Scheduler Instagram messaging reply test REC2. This reply is for app review demonstration only.':nextComment?'Social Scheduler Instagram comment reply test REC2. This reply is for app review demonstration only.':recordingTexts[kind],expiresAt:nextThird?rule.messageRec3!.expiresAt:nextMessage?rule.messageRec2!.expiresAt:nextComment?rule.commentRec2!.expiresAt:rule.expiresAt,sendEnabled:rule.messageRec3?!!nextThird:rule.messageRec2?!!nextMessage:!rule.commentRec2||!!nextComment,marker:nextThird?REC3_MARKER:nextMessage?'SS-IG-DM-1023-REC2':nextComment?'SS-IG-C-1023-REC2':kind==='message'?'SS-IG-DM-1022-REC1':'SS-IG-C-1022-REC1'};
}
export async function requireInstagramRecordingTarget(db:InboxDb,rule:InstagramReplyRecording,a:ResolvedAsset,value:SourceRef|undefined,text?:string,at=new Date(),allowExpired=false){
 const deny=()=>new HttpError(403,'Controlled Instagram reply recording unavailable');
 const s=parseInboxSource(value,'instagram');
 const selection=instagramRecordingSelection(rule,s);
 if(a.platform!=='instagram'||a.ctx.userId!==rule.userId||a.ctx.workspaceId!==rule.workspaceId||a.accountId!==rule.accountId||a.appNamespace!==rule.appId||a.providerAssetId!==rule.providerAccountId||a.connectionVersion!==rule.connectionVersion||s.connectionId!==rule.connectionId||s.connectionVersion!==rule.connectionVersion||s.instagramAccountId!==rule.accountId||a.sourceRef?.connectionId!==rule.connectionId||!allowExpired&&(!selection.sendEnabled||at.getTime()>=Date.parse(selection.expiresAt)))throw deny();
 const kind=selection.kind,r=selection.record;
 if(s.sourceRecordId!==r.sourceRecordId||(kind==='message'?s.conversationId!==('conversationId' in r?r.conversationId:undefined)||s.participantId!==r.actorId: s.commentId!==r.providerEventId||s.mediaId!==('mediaId' in r?r.mediaId:undefined))||text!==undefined&&text!==selection.text)throw deny();
 const account=await db.socialAccount.findFirst({where:{id:rule.accountId,workspaceId:rule.workspaceId,platform:'instagram',providerAccountId:rule.providerAccountId,status:'active'},select:{capabilities:true}});
 const profile=account?.capabilities;
 if(!profile||typeof profile!=='object'||Array.isArray(profile)||profile.profileUsername!==rule.username)throw deny();
 const where={id:r.sourceRecordId,workspaceId:rule.workspaceId,connectionId:rule.connectionId,connectionVersion:rule.connectionVersion,providerId:r.providerEventId,actorId:r.actorId,inbound:true,deleted:false};
 const row=kind==='message'?await db.instagramInteractionMessage.findFirst({where:{...where,conversationId:'conversationId' in r?r.conversationId:undefined}}):await db.instagramInteractionComment.findFirst({where:{...where,mediaId:'mediaId' in r?r.mediaId:undefined}});
 const marker=selection.marker;
 if(!row?.text||!new RegExp('^'+marker+'(?:\\s|$)').test(row.text))throw deny();
 return{kind,targetId:kind==='message'?r.actorId:r.providerEventId};
}
