'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {apiRequest,type Workspace} from './api';

export type WorkspaceReadStatus='loading'|'ready'|'error';
export function usePublishingWorkspaces(){
 const router=useRouter();
 const [token,setToken]=useState<string|null>(null);
 const [workspaces,setWorkspaces]=useState<Workspace[]>([]);
 const [status,setStatus]=useState<WorkspaceReadStatus>('loading');
 useEffect(()=>{
  let current=true;const controller=new AbortController();
  let stored:string|null=null;
  try{stored=window.localStorage.getItem('social_scheduler_token');}catch{setStatus('error');return;}
  if(!stored){router.replace('/login');return;}
  setToken(stored);setStatus('loading');
  void apiRequest<Workspace[]>('/workspaces',{token:stored,signal:controller.signal}).then(rows=>{
   if(!Array.isArray(rows))throw new Error('Invalid workspace response');
   if(current){setWorkspaces(rows);setStatus('ready');}
  }).catch(()=>{if(current)setStatus('error');});
  return()=>{current=false;controller.abort();};
 },[router]);
 return{token,workspaces,status};
}
