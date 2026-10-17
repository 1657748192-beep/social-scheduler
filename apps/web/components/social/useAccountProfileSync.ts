'use client';
import {useEffect,useRef,useState} from 'react';
import type {SocialAccount,SocialAccountProfileRefresh} from '../../lib/api';
import {filterSupportedPlatforms} from '../../lib/platformCounts';

export type ProfileRefresh=(id:string,mode:'auto'|'manual')=>Promise<SocialAccountProfileRefresh|null>;
export function useAccountProfileSync(accounts:SocialAccount[],enabled:boolean,onRefresh?:ProfileRefresh){
  const alive=useRef(false),attempted=useRef(new Set<string>()),running=useRef(new Set<string>());
  const [pending,setPending]=useState<string[]>([]),[version,setVersion]=useState(0);
  const [message,setMessage]=useState<{id:string;status:'updated'|'skipped'|'failed'}|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function refresh(id:string,mode:'auto'|'manual'){
    if(!enabled||!onRefresh||running.current.has(id))return;
    running.current.add(id);attempted.current.add(id);setPending([...running.current]);
    if(mode==='manual')setMessage(null);
    try{
      const result=await onRefresh(id,mode);
      if(alive.current&&mode==='manual'&&result)setMessage({id,status:result.status});
    }catch{
      if(alive.current&&mode==='manual')setMessage({id,status:'failed'});
    }finally{
      running.current.delete(id);
      if(alive.current){setPending([...running.current]);setVersion(v=>v+1);}
    }
  }
  useEffect(()=>{
    if(!enabled||!onRefresh)return;
    for(const account of filterSupportedPlatforms(accounts)){
      if(running.current.size>=2)break;
      if(account.status!=='active'||attempted.current.has(account.id))continue;
      const last=Date.parse(account.capabilities.profileSync?.lastAttemptAt??'');
      if(Number.isFinite(last)&&Date.now()-last<86_400_000)continue;
      void refresh(account.id,'auto');
    }
  },[accounts,enabled,onRefresh,version]);
  return {pending,message,refresh};
}
