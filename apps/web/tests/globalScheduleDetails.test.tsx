import React,{useState} from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {act} from 'react-test-renderer';
import {ScheduleDetailPanel} from '../components/calendar/ScheduleDetailPanel';
import {ContentCalendar} from '../components/calendar/ContentCalendar';
import {MonthCalendar} from '../components/calendar/MonthCalendar';
import {PublishedPostManager} from '../components/posts/PublishedPostManager';
import {LanguageToggle} from '../components/LanguageProvider';
import {withFacebookUI,facebookButton,facebookText,facebookWorkspaces} from './helpers/facebookManagementUI';
import type {CalendarSchedule} from '../lib/api';

export const scheduleFixture:CalendarSchedule={id:'s1',workspaceId:'w1',postVariantId:'v1',scheduledAt:'2099-01-01T12:00:27.123Z',timezone:'America/New_York',status:'scheduled',postVariant:{id:'v1',platform:'facebook',socialAccount:{id:'a1',displayName:'Page',platform:'facebook'},text:'unchanged',publishStatus:'queued',post:{id:'p1',title:'test',baseText:'unchanged',workflowStatus:'scheduled'},media:[]},publishJobs:[]};
const auth=(url:URL)=>url.pathname.endsWith('/auth/me')?Response.json({id:'u1'}):undefined;
const props={schedule:scheduleFixture,onClose(){},onDeleted(){},onUpdated(){},token:'test',workspaceId:'w1'};
async function choose(view:any,query:string){const input=view.root.findByProps({'aria-label':'发布地区与时区'});await act(async()=>input.props.onFocus());await act(async()=>input.props.onChange({target:{value:query}}));await act(async()=>input.props.onKeyDown({key:'ArrowDown',preventDefault(){}}));await act(async()=>input.props.onKeyDown({key:'Enter',preventDefault(){}}));}

test('passive viewing and zone-only save never PATCH; explicit text editing preserves exact old instant',async()=>{
 await withFacebookUI(<><LanguageToggle/><ScheduleDetailPanel {...props}/></>,async({view,requests}:any)=>{
  assert.ok(facebookText(view).includes('目标地区时间'));
  await choose(view,'Asia/Tokyo');
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.equal(requests.filter((r:any)=>r.method==='PATCH').length,0);
  await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'new text'}}));
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  const body=requests.find((r:any)=>r.method==='PATCH').body;
  assert.equal(body.scheduledAt,'2099-01-01T12:00:27.123Z');assert.ok(!body.timezone||body.timezone==='America/New_York');assert.equal(body.text,'new text');
  await act(async()=>facebookButton(view,'English').props.onClick());
  assert.equal(requests.filter((r:any)=>r.method==='PATCH').length,1);
 },(url,init)=>init?.method==='PATCH'?Response.json({...scheduleFixture,postVariant:{...scheduleFixture.postVariant,text:'new text'}}):auth(url));
});
test('explicit local date edit submits a new UTC; switching task drops the previous local edits',async()=>{
 function Harness(){const [schedule,setSchedule]=useState(scheduleFixture);return <><button onClick={()=>setSchedule({...scheduleFixture,id:'s2',scheduledAt:'2099-02-01T12:00:00.000Z'})}>next fixture</button><ScheduleDetailPanel {...props} schedule={schedule}/></>;}
 await withFacebookUI(<Harness/>,async({view,requests}:any)=>{
  await act(async()=>view.root.findByProps({'aria-label':'当地日期'}).props.onChange({target:{value:'2099-01-02'}}));
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  const body=requests.find((r:any)=>r.method==='PATCH').body;
  assert.equal(body.scheduledAt,'2099-01-02T12:00:00.000Z');assert.equal(body.timezone,'America/New_York');
  await act(async()=>facebookButton(view,'next fixture').props.onClick());
  assert.equal(view.root.findByProps({'aria-label':'当地日期'}).props.value,'2099-02-01');
 },(url,init)=>init?.method==='PATCH'?Response.json(scheduleFixture):auth(url));
});
test('unknown original zone degrades read-only without writing; membership locks still forbid editing',async()=>{
 await withFacebookUI(<ScheduleDetailPanel {...props} publishingLocked schedule={{...scheduleFixture,timezone:'Unknown/Zone'}}/>,async({view,requests}:any)=>{
  assert.ok(facebookText(view).includes('原时区不可用'));
  assert.equal(view.root.findAllByType('form').length,0);assert.equal(requests.filter((r:any)=>r.method==='PATCH').length,0);
 },auth);
});
test('calendar remains Beijing-based and drag requests do not overwrite timezone',async()=>{
 await withFacebookUI(<ContentCalendar token="test" workspaces={facebookWorkspaces}/>,async({view,requests}:any)=>{
  assert.ok(facebookText(view).includes('日历显示时区：北京时间'));
  await act(async()=>view.root.findByType(MonthCalendar).props.onDropSchedule('s1',new Date('2099-01-02T00:00:00Z'),'day'));
  const body=requests.find((r:any)=>r.method==='PATCH').body;
  assert.equal(body.scheduledAt,'2099-01-02T12:00:00.000Z');assert.equal(body.timezone,undefined);
 },(url,init)=>init?.method==='PATCH'?Response.json(scheduleFixture):url.pathname.endsWith('/schedules')?Response.json([scheduleFixture]):auth(url));
});
test('published history separates planned local/Beijing times from actual completion and accepts old responses',async t=>{
 const oldSelf=(globalThis as any).self;(globalThis as any).self=globalThis;t.after(()=>{(globalThis as any).self=oldSelf;});
 const post={id:'s1',postId:'p1',title:'published',baseText:'text',scheduledAt:'2026-10-21T00:00:00Z',timezone:'America/New_York',publishedAt:'2026-10-21T00:03:00Z',platform:'facebook',text:'text',socialAccount:null,media:[],providerPermalink:null};
 await withFacebookUI(<PublishedPostManager token="test" workspaces={facebookWorkspaces}/>,async({view}:any)=>{
  assert.ok(facebookText(view).includes('2026-10-20 20:00'));assert.ok(facebookText(view).includes('2026-10-21 08:00'));
  assert.ok(facebookText(view).includes('原时区不可用或未记录'));
 },url=>url.pathname.endsWith('/published-posts')?Response.json([post,{...post,id:'s2',timezone:undefined}]):url.pathname.endsWith('/social-accounts')?Response.json([]):url.pathname.endsWith('/auth/me')?Response.json({id:'u1',platformAdmin:false}):undefined);
});

test('calendar workspace switch clears the previous account detail before any new action',async()=>{
 await withFacebookUI(<ContentCalendar token="test" workspaces={[...facebookWorkspaces,{...facebookWorkspaces[0],id:'w2'}]}/>,async({view}:any)=>{
  await act(async()=>view.root.findByType(MonthCalendar).props.onSelectSchedule(scheduleFixture));
  assert.equal(view.root.findAllByType('form').length,1);
  const workspace=view.root.findAllByType('select').find((n:any)=>n.props.value==='w1');
  await act(async()=>workspace.props.onChange({target:{value:'w2'}}));
  assert.equal(view.root.findAllByType('form').length,0);
 },url=>url.pathname.endsWith('/schedules')?Response.json([scheduleFixture]):auth(url));
});
test('late drag response cannot reopen an account detail from the previous workspace',async()=>{
 let finish!:(r:Response)=>void;
 await withFacebookUI(<ContentCalendar token="test" workspaces={[...facebookWorkspaces,{...facebookWorkspaces[0],id:'w2'}]}/>,async({view}:any)=>{
  await act(async()=>view.root.findByType(MonthCalendar).props.onSelectSchedule(scheduleFixture));
  let drag!:Promise<void>;
  await act(async()=>{drag=view.root.findByType(MonthCalendar).props.onDropSchedule('s1',new Date('2099-01-02T00:00:00Z'),'day');});
  await act(async()=>view.root.findAllByType('select').find((n:any)=>n.props.value==='w1').props.onChange({target:{value:'w2'}}));
  await act(async()=>{finish(Response.json(scheduleFixture));await drag;});
  assert.equal(view.root.findAllByType('form').length,0);
 },(url,init)=>init?.method==='PATCH'?new Promise<Response>(r=>{finish=r;}):url.pathname.endsWith('/schedules')?Response.json(url.pathname.includes('/w1/')?[scheduleFixture]:[]):auth(url));
});
