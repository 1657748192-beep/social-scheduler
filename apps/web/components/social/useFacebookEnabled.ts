'use client';
import {useEffect,useState} from 'react';
import {facebookManagementRequest} from '../../lib/facebookManagement';
export function useFacebookEnabled(token:string|null,workspaceId?:string){
  const key=(token??'')+':'+(workspaceId??''),[status,setStatus]=useState({key:'',enabled:false});
  useEffect(()=>{
    let current=true;const controller=new AbortController();setStatus({key,enabled:false});
    if(token&&workspaceId)void facebookManagementRequest<{enabled:boolean;configured:boolean}>(token,workspaceId,'/status',{signal:controller.signal})
      .then(result=>{if(current)setStatus({key,enabled:result.enabled===true&&result.configured===true});}).catch(()=>{});
    return()=>{current=false;controller.abort();};
  },[token,workspaceId]);
  return status.key===key&&status.enabled;
}
