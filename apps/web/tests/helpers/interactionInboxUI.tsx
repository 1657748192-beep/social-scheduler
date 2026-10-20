import React from 'react';import {withFacebookUI} from './facebookManagementUI';
import type {InboxCase} from '../../lib/interactionInbox';
export const inboxAccount={id:'11111111-1111-4111-8111-111111111111',platform:'facebook',name:'Factory Wholesale',avatarUrl:null,publishingStatus:'active',capabilities:[{capability:'comments.read',available:true,reason:'available',verifiedAt:new Date().toISOString()}]};
export const inboxCase:InboxCase={id:'22222222-2222-4222-8222-222222222222',kind:'comments',accountId:inboxAccount.id,customerId:'33333333-3333-4333-8333-333333333333',customerName:'Customer One',sourceLabel:'Facebook',status:'pending',version:1,lastInboundAt:new Date().toISOString(),unread:true,tags:[],assigneeId:null,sentiment:null};
export const inboxPage=(items:any[])=>({items,nextCursor:null,accountsStatus:[{accountId:inboxAccount.id,status:'ok',count:items.length}],partial:false,observedAt:new Date().toISOString(),lastSuccessfulSyncAt:new Date().toISOString()});
export function inboxResponse(url:URL,init?:RequestInit):Response{
 if(url.pathname.endsWith('/accounts'))return Response.json(inboxPage([inboxAccount]));
 if(url.pathname.endsWith('/capabilities'))return Response.json({accounts:[{accountId:inboxAccount.id,capabilities:inboxAccount.capabilities}],authorizationEnabled:false});
 if(url.pathname.endsWith('/cases'))return Response.json(inboxPage([inboxCase]));
 if(url.pathname.endsWith('/tags'))return Response.json([]);
 if(url.pathname.endsWith('/members'))return Response.json([]);
 if(url.pathname.endsWith('/assignees'))return Response.json([]);
 if(url.pathname.endsWith('/replies'))return Response.json({status:'unknown',diagnosticId:'synthetic'});
 if(url.pathname.includes('/customers/'))return Response.json({id:inboxCase.customerId,version:1,name:'Customer One',identities:[],tags:[],notes:[],cases:[inboxCase]});
 if(url.pathname.endsWith('/refresh'))return Response.json({results:[{accountId:inboxAccount.id,status:'ok'}],partial:false,nextCursor:null});
 if(url.pathname.includes('/cases/'))return Response.json({...inboxCase,items:[{id:'c1',text:'Actual fixture comment',inbound:true,occurredAt:new Date().toISOString()}],nextCursor:null,officialUrl:'https://www.facebook.com/100_1',replyTarget:'c1',capabilities:[{capability:'comments.reply',available:true,reason:'available',verifiedAt:new Date().toISOString()}]});
 throw Error('Unexpected inbox endpoint '+url.pathname);
}
export async function withInboxUI(element:React.ReactElement,run:(f:any)=>Promise<void>,override?:(url:URL,init?:RequestInit)=>Promise<Response>|Response|undefined){return withFacebookUI(element,run,(url,init)=>override?.(url,init)??inboxResponse(url,init));}
