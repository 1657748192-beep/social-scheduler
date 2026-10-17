'use client';
import {useEffect,useRef} from 'react';
export function useInboxScope(key:string){
 const state=useRef({key,disposed:false,slots:new Map<string,AbortController>()});
 if(state.current.key!==key){state.current.disposed=true;for(const c of state.current.slots.values())c.abort();state.current={key,disposed:false,slots:new Map()};}
 useEffect(()=>{const current=state.current;current.disposed=false;return()=>{current.disposed=true;for(const c of current.slots.values())c.abort();};},[key]);
 return{capture(slot:string){const current=state.current;current.slots.get(slot)?.abort();const controller=new AbortController();current.slots.set(slot,controller);return{signal:controller.signal,current:()=>state.current===current&&!current.disposed&&current.slots.get(slot)===controller&&!controller.signal.aborted};}};
}
