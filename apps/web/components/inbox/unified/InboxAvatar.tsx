'use client';
import React,{useState} from 'react';
import {inboxInitials} from './InboxIcon';

function cachedImageUrl(value:string|null|undefined){
 if(!value||value.length>4096)return null;
 try{const u=new URL(value),hosts=['fbcdn.net','fbsbx.com','cdninstagram.com','tiktokcdn.com','tiktokcdn-us.com','tiktokcdn-eu.com','ytimg.com','ggpht.com','googleusercontent.com','pinimg.com'];return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))&&![...u.searchParams.keys()].some(k=>/^(access_token|input_token|token|client_secret|appsecret_proof)$/i.test(k))?u.href:null;}catch{return null;}
}
function CachedImage({url}:{url:string}){
 const [failed,setFailed]=useState(false);
 return failed?null:<img src={url} alt="" width={48} height={48} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>;
}
/** Render existing CDN URLs only. The name always remains beneath the image. */
export function InboxAvatar({name,url}:{name:string|null|undefined;url?:string|null}){
 const src=cachedImageUrl(url);
 return <span className="inbox-avatar" aria-hidden="true">{inboxInitials(name)}{src?<CachedImage key={src} url={src}/>:null}</span>;
}
