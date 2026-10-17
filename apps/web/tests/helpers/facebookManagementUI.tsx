import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {LanguageProvider} from '../../components/LanguageProvider';
export const facebookWorkspaces=[{id:'w1',name:'Workspace',role:'owner'}] as any;
export const readAt='2026-10-16T08:00:00.000Z';
export const envelope=(items:any[])=>({items,nextCursor:null,readAt,source:'graph',stale:false,warnings:[]});
export const facebookPages=['p1','p2'].map((id,i)=>({id,connectionId:'c'+(i+1),pageId:i===0?'100':'200',name:i===0?'First Page':'Second Page',profileUrl:`https://www.facebook.com/${i===0?'100':'200'}`,avatarUrl:null,businesses:[],publishingAccountId:'publishing-'+id,authorization:'available',selectedManagedPageId:id,connectionChoices:[{managedPageId:id,connectionId:'c'+(i+1),available:true}]}));
export function defaultFacebookResponse(url:URL):Response{
  const path=url.pathname,id=path.includes('/p2/')?'p2':'p1',page=id==='p1'?'100':'200',participant=id==='p1'?'300':'400';
  if(path.endsWith('/notifications/status'))return Response.json({enabled:false,subscription:'missing',lastReceivedAt:null,source:'signed_webhook'});
  if(path.endsWith('/status'))return Response.json({enabled:true,configured:true});
  if(path.endsWith('/pages'))return Response.json(envelope(facebookPages));
  if(path.endsWith('/capabilities'))return Response.json(Object.fromEntries(['readComments','replyComments','readMessages','replyMessages','subscription'].map(name=>[name,{status:'available'}])));
  if(path.endsWith('/conversations'))return Response.json(envelope([{id:'thread-'+id,counterpartyId:participant,counterpartyName:'Customer '+id,updatedAt:new Date().toISOString()}]));
  if(path.endsWith('/messages'))return Response.json(envelope([{id:'message-'+id,conversationId:'thread-'+id,senderId:participant,recipientId:page,inbound:true,text:'private-'+id,timestamp:new Date(Date.now()-3600000).toISOString()}]));
  if(path.endsWith('/comments'))return Response.json(envelope([{id:page+'_10',postId:page+'_1',text:'comment-'+id,senderName:'Customer '+id,timestamp:new Date().toISOString()}]));
  if(path.endsWith('/replies'))return Response.json({status:'sent',providerId:'sent-'+id});
  throw Error('Unexpected or retired fixture endpoint');
}
export async function withFacebookUI(element:React.ReactElement,run:(f:any)=>Promise<void>,override?:(url:URL,init?:RequestInit)=>Promise<Response>|Response|undefined,nodeMock?:(element:any)=>any){
  const old={fetch:globalThis.fetch,window:(globalThis as any).window,document:(globalThis as any).document};
  (globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  const timers=new Map<number,{callback:()=>void;ms:number}>(),storage:Array<[string,string]>=[],requests:Array<{path:string;method:string;body:any}>=[];let timerId=0,disposed=false,view:ReactTestRenderer;
  const document={documentElement:{lang:''},visibilityState:'visible'};
  (globalThis as any).window={localStorage:{getItem:()=>null,setItem:(k:string,v:string)=>storage.push([k,v]),removeItem(){}},dispatchEvent(){},setInterval:(callback:()=>void,ms:number)=>{timers.set(++timerId,{callback,ms});return timerId;},clearInterval:(id:number)=>timers.delete(id),location:{assign(){},search:'',pathname:'/facebook-inbox'}};
  (globalThis as any).document=document;
  globalThis.fetch=async(raw,init)=>{const url=new URL(String(raw));requests.push({path:url.pathname,method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):null});return await override?.(url,init)??defaultFacebookResponse(url);};
  const unmount=async()=>{if(!disposed){disposed=true;await act(async()=>view.unmount());}};
  try{await act(async()=>{view=create(<LanguageProvider>{element}</LanguageProvider>,nodeMock?{createNodeMock:nodeMock}:undefined);});await run({view:view!,timers,document,requests,storage,unmount});}
  finally{if(view!)await unmount();globalThis.fetch=old.fetch;(globalThis as any).window=old.window;(globalThis as any).document=old.document;}
}
export const facebookText=(view:ReactTestRenderer)=>JSON.stringify(view.toJSON());
export const facebookButton=(view:ReactTestRenderer,label:string)=>view.root.findAllByType('button').find(button=>button.children.join('')===label)!;
