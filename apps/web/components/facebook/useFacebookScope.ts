'use client';
import {useEffect,useRef} from 'react';
type Scope={key:string;disposed:boolean;sending:boolean;sequences:Map<string,number>};
export function useFacebookScope(key:string){
  const scope=useRef<Scope>({key,disposed:false,sending:false,sequences:new Map()});
  if(scope.current.key!==key)scope.current={key,disposed:false,sending:false,sequences:new Map()};
  useEffect(()=>{const current=scope.current;current.disposed=false;return()=>{current.disposed=true;};},[key]);
  function capture(slot:string){const current=scope.current,sequence=(current.sequences.get(slot)??0)+1;current.sequences.set(slot,sequence);return()=>scope.current===current&&!current.disposed&&current.sequences.get(slot)===sequence;}
  return {
    alive:()=>scope.current.key===key&&!scope.current.disposed,
    capture,
    beginSend(){if(scope.current.disposed||scope.current.sending)return null;scope.current.sending=true;const current=scope.current,valid=capture('send');return{current:valid,end(){if(valid())current.sending=false;}};}
  };
}
