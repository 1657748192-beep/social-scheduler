'use client';
import { useEffect,useState } from 'react';
import { apiRequest } from '../../lib/api';
export function useFacebookEnabled(token:string|null){
  const [enabled,setEnabled]=useState(false);
  useEffect(()=>{let current=true;setEnabled(false);if(token)void apiRequest<{enabled:boolean}>('/integrations/facebook-engagement/status',{token})
    .then(result=>{if(current)setEnabled(result.enabled===true);}).catch(()=>{});return()=>{current=false;};},[token]);
  return enabled;
}
