'use client';
import {useEffect,useRef,useState} from 'react';
import {getBaseline,type RuleSnapshot} from '@social-scheduler/timezone-rules';
import {detectComputerZone,getRulesForNewSession,latestRules,onRulesAvailable} from '../../lib/timezoneRulesClient';
export function useScheduleRuleSession({token,workspaceId,sessionKey,existingZone,dirty=false}:{token:string;workspaceId:string;sessionKey:string;existingZone?:string;dirty?:boolean}){
 const identity=`${token}:${workspaceId}:${sessionKey}`,identityRef=useRef(identity);identityRef.current=identity;
 const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
 const [state,setState]=useState<{identity:string;ready:boolean;rules:RuleSnapshot;defaultZone:string;updateAvailable:boolean}>(()=>({identity,ready:false,rules:getBaseline(),defaultZone:existingZone??'Asia/Shanghai',updateAvailable:false}));
 useEffect(()=>{
  let active=true;const controller=new AbortController();
  setState({identity,ready:false,rules:getBaseline(),defaultZone:existingZone??detectComputerZone(getBaseline()),updateAvailable:false});
  void getRulesForNewSession({token,signal:controller.signal}).then(rules=>{
   if(active&&identityRef.current===identity)setState(previous=>dirtyRef.current?{...previous,ready:true,updateAvailable:rules.digest!==previous.rules.digest}:{identity,ready:true,rules,defaultZone:existingZone??detectComputerZone(rules),updateAvailable:false});
  });
  const off=onRulesAvailable(()=>{if(active)setState(previous=>({...previous,updateAvailable:latestRules().digest!==previous.rules.digest}));});
  return()=>{active=false;controller.abort();off();};
 },[identity,existingZone,token]);
 return state.identity===identity?state:{...state,ready:false,rules:getBaseline(),defaultZone:existingZone??'Asia/Shanghai'};
}
