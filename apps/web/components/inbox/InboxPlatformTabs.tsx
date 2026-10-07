'use client';
import React from 'react';
export function InboxPlatformTabs({enabled,value,onChange}:{enabled:boolean;value:'instagram'|'facebook';onChange(value:'instagram'|'facebook'):void}){
  return <div className="button-row" aria-label="Inbox platform"><button type="button" className={value==='instagram'?'button':'button secondary'} aria-pressed={value==='instagram'} onClick={()=>onChange('instagram')}>Instagram</button>
    {enabled?<button type="button" className={value==='facebook'?'button':'button secondary'} aria-pressed={value==='facebook'} onClick={()=>onChange('facebook')}>Facebook</button>:null}</div>;
}
