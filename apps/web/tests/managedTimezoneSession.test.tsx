import React,{useState} from 'react';import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {act} from 'react-test-renderer';
import {withFacebookUI,facebookWorkspaces,facebookButton} from './helpers/facebookManagementUI';
import {ComposerForm} from '../components/composer/ComposerForm';
import {getBaseline,baselineBundle} from '@social-scheduler/timezone-rules';
import {useScheduleRuleSession} from '../components/scheduling/useScheduleRuleSession';
import {resolveLocalTime,formatScheduleTimes} from '../lib/scheduleTimeZone';
import {detectComputerZone} from '../lib/timezoneRulesClient';
test('computer zone detection uses identities only and falls back safely',()=>{
 const rules=getBaseline();assert.equal(detectComputerZone(rules,()=> 'America/New_York'),'America/New_York');assert.equal(detectComputerZone(rules,()=> 'Asia/Shanghai'),'Asia/Shanghai');assert.equal(detectComputerZone(rules,()=>{throw Error('no Intl');}),'Asia/Shanghai');
});

test('late rule updates freeze a touched form and are picked up by the next new session',async()=>{
 const b=structuredClone(baselineBundle);b.tzdbVersion=b.data.version='2026f';const raw=Buffer.from(JSON.stringify(b.data));b.sourceBytes=raw.toString('base64');b.sha256=createHash('sha256').update(raw).digest('hex');
 let release!:(r:Response)=>void;const pending=new Promise<Response>(r=>release=r);
 function Harness(){const [dirty,touch]=useState(false),[key,reopen]=useState(0);const s=useScheduleRuleSession({token:'late-version-test',workspaceId:'w',sessionKey:String(key),dirty});return <><output data-version={s.rules.version} data-ready={s.ready} data-notice={s.updateAvailable}/><button onClick={()=>touch(true)}>touch</button><button onClick={()=>{touch(false);reopen(n=>n+1);}}>reopen</button></>;}
 await withFacebookUI(<Harness/>,async({view}:any)=>{
  await act(async()=>view.root.findAllByType('button')[0].props.onClick());
  await act(async()=>{release(Response.json({version:b.tzdbVersion,digest:b.sha256,schemaVersion:1,engineCompatibility:1}));await new Promise(r=>setImmediate(r));});
  assert.equal(view.root.findByType('output').props['data-version'],'2026e');assert.equal(view.root.findByType('output').props['data-notice'],true);
  await act(async()=>view.root.findAllByType('button')[1].props.onClick());
  assert.equal(view.root.findByType('output').props['data-version'],'2026f');
 },url=>url.pathname.endsWith('/manifest')?pending:url.pathname.includes('/timezone-rules/data/')?Response.json(b):undefined);
});
test('five formerly blocked zones now resolve through a supplied immutable snapshot',()=>{
 const result=resolveLocalTime('2099-11-05T20:00','America/Winnipeg',getBaseline());assert.equal(result.kind,'resolved');
 assert.equal(formatScheduleTimes('2026-11-06T01:00:00.000Z','America/Winnipeg','zh-CN',getBaseline()).localLabel,'2026-11-05 20:00 UTC-05:00');
});
test('real composer initializes from the computer zone without requiring online rule data',async()=>{
 const Original=Intl.DateTimeFormat;
 try{
  Intl.DateTimeFormat=function(...args:any[]){const result=new (Original as any)(...args);if(!args.length)result.resolvedOptions=()=>({timeZone:'America/New_York'});return result;} as any;
  await withFacebookUI(<ComposerForm token="computer-zone-test" workspaces={facebookWorkspaces}/>,async({view}:any)=>{
   await act(async()=>facebookButton(view,'定时发布').props.onClick());
   const {SchedulePicker}=await import('../components/composer/SchedulePicker');const picker=view.root.findByType(SchedulePicker);assert.equal(picker.props.value.zoneId,'America/New_York');
  },url=>url.pathname.endsWith('/auth/me')?Response.json({id:'u1'}):url.pathname.endsWith('/social-accounts')?Response.json([]):undefined);
 }finally{Intl.DateTimeFormat=Original;}
});
