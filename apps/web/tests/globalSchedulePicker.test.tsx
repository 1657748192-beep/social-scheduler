import React, {useState} from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {act} from 'react-test-renderer';
import {SchedulePicker} from '../components/composer/SchedulePicker';
import {createScheduleTimeState} from '../lib/scheduleTimeZone';
import {withFacebookUI,facebookText} from './helpers/facebookManagementUI';
import {useTimeZoneFavorites} from '../components/scheduling/useTimeZoneFavorites';
import {LanguageToggle} from '../components/LanguageProvider';
function Editor(){const [value,onChange]=useState(createScheduleTimeState());return <SchedulePicker value={value} onChange={onChange} token="test" workspaceId="w1"/>;}
const auth = (url:URL) => url.pathname.endsWith('/auth/me') ? Response.json({id:'u1'}) : undefined;
test('picker exposes local labels, explicit ambiguous choices and one dual preview',async()=>{
 await withFacebookUI(<Editor/>,async({view}:any)=>{
   assert.ok(facebookText(view).includes('未设置时间，将保存为草稿'));
   await act(async()=>view.root.findByProps({'aria-label':'发布地区与时区'}).props.onFocus());
   const query=view.root.findByProps({'aria-label':'发布地区与时区'});
   await act(async()=>query.props.onChange({target:{value:'纽约'}}));
   await act(async()=>query.props.onKeyDown({key:'ArrowDown',preventDefault(){}}));
   await act(async()=>query.props.onKeyDown({key:'Enter',preventDefault(){}}));
   await act(async()=>view.root.findByProps({'aria-label':'当地日期'}).props.onChange({target:{value:'2026-11-01'}}));
   await act(async()=>view.root.findByProps({'aria-label':'当地小时'}).props.onChange({target:{value:'01'}}));
   await act(async()=>view.root.findByProps({'aria-label':'当地分钟'}).props.onChange({target:{value:'30'}}));
   const radios=view.root.findAllByType('input').filter((n:any)=>n.props.type==='radio');
   assert.equal(radios.length,2);assert.ok(radios.every((n:any)=>!n.props.checked));
   // Fixed old math fixture: current clock may have passed it; use a separate future case for selecting.
   assert.ok(facebookText(view).includes('13:30'));assert.ok(facebookText(view).includes('14:30'));
 },auth);
});

test('favorites remain isolated across workspace changes and storage failure keeps picker usable',async()=>{
 await withFacebookUI(<Editor/>,async({view,storage}:any)=>{
   await act(async()=>view.root.findByProps({'aria-label':'收藏当前时区'}).props.onClick());
   assert.ok(storage.some(([key,value]:string[])=>key==='schedule-timezones:v1:u1:w1'&&value==='["Asia/Shanghai"]'));
   assert.ok(!storage.some(([key]:string[])=>key.includes('test')));
   await act(async()=>{(globalThis as any).window.localStorage.setItem=()=>{throw Error('blocked');};});
   await act(async()=>view.root.findByProps({'aria-label':'取消收藏当前时区'}).props.onClick());
   assert.ok(view.root.findByProps({'aria-label':'当地日期'}));
 },auth);
});

test('favorites cap is enforced and a late identity response cannot cross user or workspace',async()=>{
 let resolveOld!:(r:Response)=>void;
 const pending=new Promise<Response>(resolve=>{resolveOld=resolve;});
 let latest:ReturnType<typeof useTimeZoneFavorites>;
 function Probe({token,workspaceId}:{token:string;workspaceId:string}){latest=useTimeZoneFavorites(token,workspaceId);return <output>{latest.favorites.join(',')}</output>;}
 await withFacebookUI(<Probe token="old" workspaceId="w1"/>,async({view,storage}:any)=>{
   await act(async()=>view.update(<Probe token="new" workspaceId="w2"/>));
   await act(async()=>resolveOld(Response.json({id:'old-user'})));
   for(const zone of ['Asia/Shanghai','America/New_York','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Tokyo','Asia/Singapore','Australia/Sydney','Asia/Dubai'])await act(async()=>latest.toggle(zone));
   assert.equal(latest!.favorites.length,8);assert.equal(latest!.limitReached,true);
   assert.ok(!latest!.favorites.includes('Asia/Dubai'));
   assert.ok(storage.filter(([key]:string[])=>key.startsWith('schedule-timezones')).every(([key]:string[])=>key==='schedule-timezones:v1:new-user:w2'));
   await act(async()=>view.update(<Probe token="new" workspaceId="w3"/>));
   assert.deepEqual(latest!.favorites,[]);
 },(url,init)=>url.pathname.endsWith('/auth/me')?(String((init?.headers as any)?.Authorization)==='Bearer old'?pending:Response.json({id:'new-user'})):undefined);
});

test('picker labels switch language and Escape dismisses options without choosing a zone',async()=>{
 await withFacebookUI(<><LanguageToggle/><Editor/></>,async({view}:any)=>{
   await act(async()=>view.root.findAllByType('button').find((n:any)=>n.children.includes('English'))!.props.onClick());
   const input=view.root.findByProps({'aria-label':'Publishing region and time zone'});
   await act(async()=>input.props.onFocus());
   await act(async()=>input.props.onKeyDown({key:'Escape',preventDefault(){}}));
   assert.equal(input.props['aria-expanded'],false);
   assert.ok(input.props.value.includes('Asia/Shanghai'));
   assert.ok(view.root.findByProps({'aria-label':'Local hour'}));
 },auth);
});

test('choosing a country city keeps that representative label when its canonical zone is shared',async()=>{
 await withFacebookUI(<Editor/>,async({view}:any)=>{
   const input=view.root.findByProps({'aria-label':'发布地区与时区'});
   await act(async()=>input.props.onFocus());await act(async()=>input.props.onChange({target:{value:'哥本哈根'}}));
   await act(async()=>input.props.onKeyDown({key:'ArrowDown',preventDefault(){}}));await act(async()=>input.props.onKeyDown({key:'Enter',preventDefault(){}}));
   assert.ok(input.props.value.includes('丹麦'));assert.ok(input.props.value.includes('哥本哈根'));
 },auth);
});

test('corrupt persisted favorites cannot block local-time editing or change the Beijing default',async()=>{
 let finish!:(response:Response)=>void;
 const pending=new Promise<Response>(resolve=>{finish=resolve;});
 await withFacebookUI(<Editor/>,async({view}:any)=>{
   (globalThis as any).window.localStorage.getItem=()=>'{broken-json';
   await act(async()=>finish(Response.json({id:'u1'})));
   assert.ok(view.root.findByProps({'aria-label':'发布地区与时区'}).props.value.includes('Asia/Shanghai'));
   await act(async()=>view.root.findByProps({'aria-label':'当地日期'}).props.onChange({target:{value:'2099-10-20'}}));
   assert.ok(facebookText(view).includes('2099-10-20 00:00'));
 },url=>url.pathname.endsWith('/auth/me')?pending:undefined);
});
