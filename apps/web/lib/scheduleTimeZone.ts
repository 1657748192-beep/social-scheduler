import {getBaseline,type RuleSnapshot,type TimeResolution,type TimeCandidate} from '@social-scheduler/timezone-rules';
import {canonicalTimeZone} from './timezoneCatalog';
export type {TimeCandidate,TimeResolution};
export type ScheduleTimeState={zoneId:string;localValue:string;instant:string|null};
export type ScheduleSubmission={kind:'draft'}|{kind:'scheduled';scheduledAt:string;timezone:string}|{kind:'error';reason:string};
const beijing='Asia/Shanghai';
const pad=(n:number)=>String(n).padStart(2,'0');
const localInput=(p:{year:number;month:number;day:number;hour:number;minute:number})=>`${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
function readInstant(s:string){return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/.test(s)?Date.parse(s):NaN;}
function selectedZone(zone:string,rules:RuleSnapshot){return canonicalTimeZone(zone)??rules.canonicalZone(zone)??zone;}
export function resolveLocalTime(value:string,zoneId:string,rules:RuleSnapshot=getBaseline()):TimeResolution{return rules.resolve(zoneId,value);}
export function createScheduleTimeState(instant?:string,zoneId=beijing,rules:RuleSnapshot=getBaseline()):ScheduleTimeState{
 const zone=selectedZone(zoneId,rules),ms=instant?readInstant(instant):NaN;let localValue='';
 if(Number.isFinite(ms))try{localValue=localInput(rules.localParts(zone,ms));}catch{}
 return {zoneId:zone,instant:Number.isFinite(ms)?instant!:null,localValue};
}
export function editScheduleLocal(state:ScheduleTimeState,value:string,rules:RuleSnapshot=getBaseline()):ScheduleTimeState{
 const result=resolveLocalTime(value,state.zoneId,rules);return {...state,localValue:value,instant:result.kind==='resolved'?result.candidate.instant:null};
}
export function selectScheduleOccurrence(state:ScheduleTimeState,instant:string,rules:RuleSnapshot=getBaseline()):ScheduleTimeState{
 const result=resolveLocalTime(state.localValue,state.zoneId,rules);return {...state,instant:result.kind==='ambiguous'&&result.candidates.some(c=>c.instant===instant)?instant:null};
}
export function switchScheduleZone(state:ScheduleTimeState,zoneId:string,rules:RuleSnapshot=getBaseline()):ScheduleTimeState{
 if(state.instant){const next=createScheduleTimeState(state.instant,zoneId,rules);return {...next,localValue:next.localValue||state.localValue};}
 return editScheduleLocal({...state,zoneId:selectedZone(zoneId,rules)},state.localValue,rules);
}
export function getScheduleSubmission(state:ScheduleTimeState,nowMs:number,rules:RuleSnapshot=getBaseline()):ScheduleSubmission{
 if(!state.localValue&&!state.instant)return {kind:'draft'};
 const resolution=resolveLocalTime(state.localValue,state.zoneId,rules);if(resolution.kind==='invalid')return {kind:'error',reason:resolution.reason};
 if(!state.instant||resolution.kind==='empty')return {kind:'error',reason:'unresolved'};
 const millis=readInstant(state.instant),candidates=resolution.kind==='resolved'?[resolution.candidate]:resolution.candidates;
 if(!Number.isFinite(millis)||!candidates.some(c=>millis>=Date.parse(c.instant)&&millis<Date.parse(c.instant)+60000))return {kind:'error',reason:'unresolved'};
 if(!Number.isFinite(nowMs)||millis<=nowMs)return {kind:'error',reason:'past'};
 return {kind:'scheduled',scheduledAt:state.instant,timezone:selectedZone(state.zoneId,rules)};
}
export function getLocalToday(zone:string,nowMs:number,rules:RuleSnapshot=getBaseline()):string{
 try{return localInput(rules.localParts(zone,nowMs)).slice(0,10);}catch{return '';}
}
export function formatScheduleTimes(instant:string,zone?:string,_locale='zh-CN',rules:RuleSnapshot=getBaseline()):{localLabel:string|null;beijingLabel:string;dayDelta:number;invalidZone:boolean}{
 const ms=readInstant(instant);
 function label(id:string){const p=rules.localParts(id,ms),offset=rules.offsetAt(id,ms);return `${localInput(p).replace('T',' ')} UTC${offset>=0?'+':'-'}${pad(Math.floor(Math.abs(offset)/60))}:${pad(Math.abs(offset)%60)}`;}
 let localLabel:string|null=null,beijingLabel='—',dayDelta=0;
 try{beijingLabel=label(beijing);}catch{}
 if(zone)try{localLabel=label(zone);const a=rules.localParts(zone,ms),b=rules.localParts(beijing,ms);dayDelta=Math.round((Date.UTC(b.year,b.month-1,b.day)-Date.UTC(a.year,a.month-1,a.day))/86400000);}catch{}
 return {localLabel,beijingLabel,dayDelta,invalidZone:localLabel===null};
}
