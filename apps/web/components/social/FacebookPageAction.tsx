'use client';
import {useEffect,useId,useRef,useState,type CSSProperties} from 'react';
import {useLanguage} from '../LanguageProvider';

export function FacebookPageAction({label,description,disabled,onClick}:{label:string;description:string;disabled:boolean;onClick():void}){
 const {t}=useLanguage(),id=useId(),anchor=useRef<HTMLSpanElement>(null),hint=useRef<HTMLSpanElement>(null);
 const [hover,setHover]=useState(false),[focus,setFocus]=useState(false),[pinned,setPinned]=useState(false),[position,setPosition]=useState<CSSProperties>();
 const open=hover||focus||pinned;
 function close(){setHover(false);setFocus(false);setPinned(false);}
 useEffect(()=>{
  if(!open)return;
  function place(){
   const rect=anchor.current?.getBoundingClientRect();if(!rect)return;
   const width=Math.min(320,window.innerWidth-24);
   if(hint.current){hint.current.style.width=width+'px';hint.current.style.maxHeight='calc(100dvh - 24px)';}
   const height=hint.current?.getBoundingClientRect().height??180;
   const belowSpace=window.innerHeight-rect.bottom-12,aboveSpace=rect.top-12;
   const below=belowSpace>=height||belowSpace>=aboveSpace;
   // Keep the help surface contiguous with its trigger, so mouse users can
   // cross into it to read/scroll without a pointer-leave gap closing it.
   setPosition({width,left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),maxHeight:Math.max(44,below?belowSpace:aboveSpace),...(below?{top:rect.bottom,bottom:undefined}:{bottom:Math.max(12,window.innerHeight-rect.top),top:undefined})});
  }
  place();window.addEventListener?.('resize',place);window.addEventListener?.('scroll',place,true);
  return()=>{window.removeEventListener?.('resize',place);window.removeEventListener?.('scroll',place,true);};
 },[open,label,description]);
 useEffect(()=>{
  if(!pinned)return;
  const outside=(event:PointerEvent)=>{if(!anchor.current?.contains(event.target as Node))close();};
  document.addEventListener?.('pointerdown',outside);
  return()=>document.removeEventListener?.('pointerdown',outside);
 },[pinned]);
 return <span className="facebook-page-action" ref={anchor} onPointerEnter={event=>{if(event.pointerType==='mouse'||event.pointerType==='pen')setHover(true);}} onPointerLeave={()=>setHover(false)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))close();}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}}}>
  <button className="button secondary" type="button" disabled={disabled} onFocus={()=>setFocus(true)} aria-describedby={open?id:undefined} onClick={onClick}>{label}</button>
  <button className="facebook-page-action-info" type="button" aria-label={t(label+'说明',label+' information')} aria-expanded={open} aria-controls={open?id:undefined} aria-describedby={open?id:undefined} onFocus={()=>setFocus(true)} onClick={()=>{setHover(false);setFocus(false);setPinned(value=>!value);}}><span aria-hidden="true">ⓘ</span></button>
  {open?<span ref={hint} role="tooltip" id={id} className="facebook-page-action-hint" style={{...position,visibility:position?'visible':'hidden'}}><strong>{label}</strong><span>{description}</span><small>{t('仅导入勾选的新增主页，已有主页的权限、凭据和排程保持不变。','Only selected new Pages are imported. Existing Page permissions, credentials and schedules remain unchanged.')}</small></span>:null}
 </span>;
}
