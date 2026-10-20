import React,{useState} from 'react';import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {act} from 'react-test-renderer';
import {withFacebookUI,facebookWorkspaces,facebookButton} from './helpers/facebookManagementUI';
import {ComposerForm} from '../components/composer/ComposerForm';
import {getBaseline,baselineBundle} from '@social-scheduler/timezone-rules';
import {useScheduleRuleSession} from '../components/scheduling/useScheduleRuleSession';
import {resolveLocalTime,formatScheduleTimes,createScheduleTimeState,editScheduleLocal,getScheduleSubmission} from '../lib/scheduleTimeZone';
import {SchedulePicker} from '../components/composer/SchedulePicker';
import {ScheduleDetailPanel} from '../components/calendar/ScheduleDetailPanel';
import {detectComputerZone} from '../lib/timezoneRulesClient';
test('computer zone detection uses identities only and falls back safely',()=>{
 const rules=getBaseline();assert.equal(detectComputerZone(rules,()=> 'America/New_York'),'America/New_York');assert.equal(detectComputerZone(rules,()=> 'Asia/Shanghai'),'Asia/Shanghai');assert.equal(detectComputerZone(rules,()=>{throw Error('no Intl');}),'Asia/Shanghai');
});

test('late rule updates freeze a touched form and are picked up by the next new session',async()=>{
 const b=structuredClone(baselineBundle);b.tzdbVersion=b.data.version='2026f';const raw=Buffer.from(JSON.stringify(b.data));b.sourceBytes=raw.toString('base64');b.sha256=createHash('sha256').update(raw).digest('hex');
 let release!:(r:Response)=>void;const pending=new Promise<Response>(r=>release=r);
 function Harness(){const [dirty,touch]=useState(false),[key,reopen]=useState(0),[time,setTime]=useState(()=>editScheduleLocal(createScheduleTimeState(undefined,'America/New_York'),'2099-11-01T01:30'));const s=useScheduleRuleSession({token:'late-version-test',workspaceId:'w',sessionKey:String(key),dirty,existingZone:'America/New_York'});return <><output data-version={s.rules.version} data-ready={s.ready} data-notice={s.updateAvailable} data-instant={getScheduleSubmission(time,0,s.rules).kind==='scheduled'?time.instant:null}/><SchedulePicker token="late-version-test" workspaceId="w" value={time} rules={s.rules} onChange={v=>{touch(true);setTime(v);}}/><button onClick={()=>{touch(false);reopen(n=>n+1);}}>reopen</button></>;}
 await withFacebookUI(<Harness/>,async({view}:any)=>{
  await act(async()=>view.root.findAllByProps({type:'radio'})[1].props.onChange());
  await act(async()=>{release(Response.json({version:b.tzdbVersion,digest:b.sha256,schemaVersion:1,engineCompatibility:1}));await new Promise(r=>setImmediate(r));});
  assert.equal(view.root.findByType('output').props['data-version'],'2026e');assert.equal(view.root.findByType('output').props['data-notice'],true);
  assert.equal(view.root.findByType('output').props['data-instant'],'2099-11-01T06:30:00.000Z');
  await act(async()=>facebookButton(view,'reopen').props.onClick());
  assert.equal(view.root.findByType('output').props['data-version'],'2026f');
 },url=>url.pathname.endsWith('/manifest')?pending:url.pathname.includes('/timezone-rules/data/')?Response.json(b):undefined);
});

test('text-save prop refresh retains the locked rules and exact original instant',async()=>{
 const b=structuredClone(baselineBundle);b.tzdbVersion=b.data.version='2026f';b.data.zones.push('Test/Fixed|FIX|-20|0||');const bytes=Buffer.from(JSON.stringify(b.data));b.sourceBytes=bytes.toString('base64');b.sha256=createHash('sha256').update(bytes).digest('hex');
 const original:any={id:'locked-schedule',workspaceId:'w1',postVariantId:'v1',scheduledAt:'2099-01-01T12:00:27.123Z',timezone:'Test/Fixed',status:'scheduled',postVariant:{id:'v1',platform:'facebook',text:'before',socialAccount:{id:'a1',displayName:'Page',platform:'facebook'},post:{id:'p1',baseText:'before'},media:[]},publishJobs:[]};
 function Harness(){const [schedule,set]=useState(original);return <ScheduleDetailPanel schedule={schedule} onUpdated={set} token="locked-detail-test" workspaceId="w1" onClose={()=>{}} onDeleted={()=>{}}/>;}
 await withFacebookUI(<Harness/>,async({view,requests}:any)=>{
  await act(async()=>{await new Promise(r=>setImmediate(r));});
  assert.equal(view.root.findByType(SchedulePicker).props.value.localValue,'2099-01-01T14:00');
  await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'after'}}));await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.equal(view.root.findByType(SchedulePicker).props.value.localValue,'2099-01-01T14:00');assert.equal(view.root.findByType(SchedulePicker).props.value.instant,'2099-01-01T12:00:27.123Z');assert.equal(requests.find((r:any)=>r.method==='PATCH').body.timezone,undefined);
 },(url,init)=>url.pathname.endsWith('/manifest')?Response.json({version:'2026f',digest:b.sha256,schemaVersion:1,engineCompatibility:1}):url.pathname.includes('/timezone-rules/data/')?Response.json(b):init?.method==='PATCH'?Response.json({...original,postVariant:{...original.postVariant,text:'after'}}):url.pathname.endsWith('/auth/me')?Response.json({id:'u1'}):undefined);
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
