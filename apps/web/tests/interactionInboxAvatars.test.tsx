import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {act} from 'react-test-renderer';
import {withInboxUI,inboxCase} from './helpers/interactionInboxUI';import {facebookText} from './helpers/facebookManagementUI';
test('list displays cached customer avatar and returns to initials when loading fails',async()=>{
 const {InteractionList}=await import('../components/inbox/unified/InteractionList');
 await withInboxUI(<InteractionList items={[{...inboxCase,customerName:'Andy Peng',customerAvatarUrl:'https://scontent.fbcdn.net/andy.jpg'} as any]} activeId={null} onSelect={()=>{}} loading={false} failed={false} hasMore={false} onMore={()=>{}}/>,async({view}:any)=>{
  const img=view.root.findByType('img');assert.equal(img.props.src,'https://scontent.fbcdn.net/andy.jpg');assert.equal(img.props.referrerPolicy,'no-referrer');await act(async()=>img.props.onError());assert.equal(view.root.findAllByType('img').length,0);assert.match(facebookText(view),/AP/);
 });
});
test('detail header customer panel and message avatars respect selected account and actual sender',async()=>{
 const {InteractionDetail}=await import('../components/inbox/unified/InteractionDetail');
 await withInboxUI(<InteractionDetail token="test" workspaceId="w1" item={inboxCase} accountName="Page" canWrite canManage onClose={()=>{}} onDirtyChange={()=>{}} onUpdated={()=>{}} onAccessDenied={()=>{}}/>,async({view}:any)=>{
  const images=view.root.findAllByType('img').map((x:any)=>x.props.src);assert.equal(images.filter((x:string)=>x==='https://scontent.fbcdn.net/andy.jpg').length,3);assert.equal(images.filter((x:string)=>x==='https://scontent.fbcdn.net/page.jpg').length,1);assert.ok(!images.includes('https://scontent.fbcdn.net/foreign.jpg'));
 },url=>{if(url.pathname.includes('/customers/'))return Response.json({id:inboxCase.customerId,version:1,name:'Andy Peng',identities:[{accountId:'other',avatarUrl:'https://scontent.fbcdn.net/foreign.jpg'},{accountId:inboxCase.accountId,avatarUrl:'https://scontent.fbcdn.net/andy.jpg',name:'Andy Peng'}],tags:[],notes:[],cases:[]});if(url.pathname.endsWith('/cases/'+inboxCase.id))return Response.json({...inboxCase,customerName:'Andy Peng',customerAvatarUrl:'https://scontent.fbcdn.net/andy.jpg',accountAvatarUrl:'https://scontent.fbcdn.net/page.jpg',items:[{id:'c1',senderName:'Andy Peng',text:'Question',inbound:true,senderAvatarUrl:'https://scontent.fbcdn.net/andy.jpg',occurredAt:new Date().toISOString()},{id:'r1',text:'Reply',inbound:false,senderAvatarUrl:'https://scontent.fbcdn.net/page.jpg',occurredAt:new Date().toISOString()}],nextCursor:null,replyTarget:'c1',capabilities:[]});});
});
test('avatar rejects Graph lookup endpoints and retains initials',async()=>{
 const {InboxAvatar}=await import('../components/inbox/unified/InboxAvatar');
 await withInboxUI(<InboxAvatar name="Andy Peng" url="https://graph.facebook.com/300/picture?access_token=secret"/>,async({view}:any)=>{
  assert.equal(view.root.findAllByType('img').length,0);assert.match(facebookText(view),/AP/);
 });
});
test('a different cached avatar URL gets a fresh image attempt after an earlier failure',async()=>{
 const {InboxAvatar}=await import('../components/inbox/unified/InboxAvatar');let change!:(value:string)=>void;
 function Subject(){const [url,setUrl]=React.useState('https://scontent.fbcdn.net/old.jpg');change=setUrl;return <InboxAvatar name="Andy Peng" url={url}/>;}
 await withInboxUI(<Subject/>,async({view}:any)=>{
  await act(async()=>view.root.findByType('img').props.onError());assert.equal(view.root.findAllByType('img').length,0);
  await act(async()=>change('https://scontent.fbcdn.net/new.jpg'));assert.equal(view.root.findByType('img').props.src,'https://scontent.fbcdn.net/new.jpg');
 });
});
