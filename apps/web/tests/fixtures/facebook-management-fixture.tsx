import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LanguageProvider} from '../../components/LanguageProvider';
import {FacebookManagementPanel} from '../../components/facebook/FacebookManagementPanel';
import {FacebookInbox} from '../../components/inbox/FacebookInbox';
import {FacebookPostComments} from '../../components/posts/FacebookPostComments';

// Local-only browser fixture: real UI, synthetic API boundary, no network fallback.
const workspaces=[{id:'w1',name:'本机测试工作区',role:'owner'}] as any;
const pages=Array.from({length:21},(_,i)=>({id:`p${i+1}`,connectionId:'c1',pageId:String(100+i),name:`测试主页 ${String(i+1).padStart(2,'0')}`,profileUrl:`https://www.facebook.com/${100+i}`,avatarUrl:null,businesses:[{id:'500',name:'测试 BM',relation:'owned'}],publishingAccountId:`publishing-${i+1}`,authorization:'available',selectedManagedPageId:`p${i+1}`,connectionChoices:[{managedPageId:`p${i+1}`,connectionId:'c1',available:true},...(i===0?[{managedPageId:'alternate',connectionId:'c2',available:true}]:[])]}));
const envelope=(items:any[])=>({items,nextCursor:null,readAt:new Date().toISOString(),source:'graph',stale:false,warnings:[]});
let sends=0;
window.fetch=async(raw,init)=>{
  const url=new URL(String(raw),location.origin),path=url.pathname;
  if(!path.includes('/facebook-management/'))return Response.json({message:'Fixture forbids external or retired APIs'},{status:400});
  if(path.endsWith('/notifications/status'))return Response.json({enabled:false,subscription:'missing',lastReceivedAt:null,source:'signed_webhook'});
  if(path.endsWith('/status'))return Response.json({enabled:true,configured:true});
  if(path.endsWith('/connections'))return Response.json(['c1','c2'].map(id=>({id,authorizedBy:'测试授权人',ownConnection:true,status:'active',lastReadAt:new Date().toISOString(),createdAt:new Date().toISOString()})));
  if(path.endsWith('/pages'))return Response.json(envelope(pages));
  if(path.endsWith('/select')){const id=path.match(/\/pages\/([^/]+)\/select$/)![1];pages[0].selectedManagedPageId=id;pages[0].id=id;pages[0].connectionId=id==='alternate'?'c2':'c1';return Response.json({managedPageId:id});}
  if(path.endsWith('/disconnect'))return Response.json({ok:true});
  if(path.endsWith('/capabilities'))return Response.json(Object.fromEntries(['readComments','replyComments','readMessages','replyMessages','subscription'].map(k=>[k,{status:'available'}])));
  const page=path.match(/\/pages\/([^/]+)/)?.[1]??'p1';
  if(path.endsWith('/conversations'))return Response.json(envelope([{id:`thread-${page}`,counterpartyId:'300',counterpartyName:`合成测试客户 ${page}`,updatedAt:new Date().toISOString()}]));
  if(path.endsWith('/messages'))return Response.json(envelope([{id:`message-${page}`,conversationId:`thread-${page}`,senderId:'300',recipientId:'100',inbound:true,text:`仅用于本机验收的合成消息 ${page}`,timestamp:new Date(Date.now()-3600000).toISOString()}]));
  if(path.endsWith('/comments'))return Response.json(envelope([{id:'100_10',postId:'100_1',text:'仅用于本机验收的合成评论',senderName:'测试客户',timestamp:new Date().toISOString()}]));
  if(path.endsWith('/replies')){sends++;document.getElementById('fixture-send-count')!.textContent=String(sends);await new Promise(r=>setTimeout(r,500));return Response.json({status:'sent',providerId:`synthetic-${sends}`});}
  return Response.json({message:'Unimplemented synthetic endpoint'},{status:400});
};
function Fixture(){const [view,setView]=useState('bm');return <LanguageProvider><main style={{padding:16,maxWidth:1150,margin:'auto'}}><h1>Facebook 本机验收（合成数据）</h1><p>无真实凭据、无 Meta 请求；合成发送次数：<span id="fixture-send-count">0</span></p><nav><button onClick={()=>setView('bm')}>BM 测试</button> <button onClick={()=>setView('inbox')}>私信测试</button> <button onClick={()=>setView('comments')}>评论测试</button></nav>{view==='bm'?<FacebookManagementPanel token="local-fixture-only" workspaces={workspaces}/>:view==='inbox'?<FacebookInbox token="local-fixture-only" workspaces={workspaces}/>:<FacebookPostComments token="local-fixture-only" workspaceId="w1" managedPageId="p1" connectionId="c1" scheduleId="schedule-local" providerPostId="100_1" pageName="测试主页 01" role="owner"/>}</main></LanguageProvider>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
