"use client";

import {useEffect,useId,useState} from 'react';
import {editScheduleLocal,getLocalToday,getScheduleSubmission,resolveLocalTime,selectScheduleOccurrence,switchScheduleZone,formatScheduleTimes,type ScheduleTimeState} from '../../lib/scheduleTimeZone';
import {useLanguage} from '../LanguageProvider';
import {LocalDateTimeFields} from '../scheduling/LocalDateTimeFields';
import {TimeZoneSelector} from '../scheduling/TimeZoneSelector';
import {ScheduledTimePreview} from '../scheduling/ScheduledTimePreview';
import {useTimeZoneFavorites} from '../scheduling/useTimeZoneFavorites';
import {getBaseline,type RuleSnapshot} from '@social-scheduler/timezone-rules';
type Props={value:ScheduleTimeState;onChange:(v:ScheduleTimeState)=>void;token:string;workspaceId:string;editing?:boolean;rules?:RuleSnapshot;ready?:boolean;updateAvailable?:boolean};
export function SchedulePicker({value,onChange,token,workspaceId,editing=false,rules=getBaseline(),ready=true,updateAvailable=false}:Props){
  const {t}=useLanguage(), id=useId(), favorites=useTimeZoneFavorites(token,workspaceId);
  const [notice,setNotice]=useState(false),[now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
  const resolution=resolveLocalTime(value.localValue,value.zoneId,rules), submission=getScheduleSubmission(value,now,rules);
  const errors:Record<string,string>={date:t('请填写完整有效的当地日期和时间。','Enter a complete valid local date and time.'),zone:t('请选择有效时区。','Choose a valid time zone.'),gap:t('这个当地时间不存在，请选择其他时间；系统不会自动顺延。','This local time does not exist. Choose another time; it will not be shifted automatically.'),unsupported:t('该日期超出当前时区规则的支持范围，请选择其他时间。','This date is outside the supported time-zone rule range. Choose another time.'),unresolved:t('发布时间尚未确定，请选择重复时刻中的一次。','Publishing time is unresolved. Select an occurrence.'),past:t('发布时间已过去，请重新选择未来时间。','Publishing time has passed. Choose a future time.')};
  return <section className="composer-panel schedule-global-picker">
    <p className="section-kicker">{t('发布时间','Publishing time')}</p><h2>{t('定时发布','Schedule publishing')}</h2>
    {!ready?<p className="muted">{t('正在准备时区规则…','Preparing time-zone rules…')}</p>:null}
    {updateAvailable?<p className="muted">{t('时区规则已更新，下次新建排程使用。','Time-zone rules updated. New schedules will use them next time.')}</p>:null}
    <TimeZoneSelector value={value.zoneId} favorites={favorites.favorites} onToggleFavorite={favorites.toggle} favoritesReady={favorites.ready} onChange={zone=>{setNotice(Boolean(value.instant));onChange(switchScheduleZone(value,zone,rules));}}/>
    {favorites.limitReached?<p role="alert" className="error">{t('最多收藏 8 个时区，请先取消一个收藏。','You can favorite up to 8 time zones. Remove one first.')}</p>:null}
    <LocalDateTimeFields value={value.localValue} minDate={editing?undefined:getLocalToday(value.zoneId,now,rules)} descriptionId={id} onChange={local=>{setNotice(false);onChange(editScheduleLocal(value,local,rules));}}/>
    {resolution.kind==='ambiguous'?<fieldset className="schedule-occurrences"><legend>{t('当地时间出现两次，请选择','This local time occurs twice. Select one')}</legend>{resolution.candidates.map((candidate,i)=><label key={candidate.instant}><input type="radio" name={`${id}-occurrence`} checked={Boolean(value.instant&&Math.floor(Date.parse(value.instant)/60000)===Math.floor(Date.parse(candidate.instant)/60000))} disabled={Date.parse(candidate.instant)<=now} onChange={()=>onChange(selectScheduleOccurrence(value,candidate.instant,rules))}/><span>{i===0?t('第一次','First occurrence'):t('第二次','Second occurrence')} · UTC{candidate.offsetMinutes>=0?'+':'−'}{String(Math.floor(Math.abs(candidate.offsetMinutes)/60)).padStart(2,'0')}:{String(Math.abs(candidate.offsetMinutes)%60).padStart(2,'0')}<small>{t('北京时间','Beijing time')} {formatScheduleTimes(candidate.instant,'Asia/Shanghai',undefined,rules).beijingLabel}</small></span></label>)}</fieldset>:null}
    <p id={id} className={submission.kind==='error'?'error':'muted'}>{submission.kind==='draft'?t('未设置时间，将保存为草稿','No time set. This will be saved as a draft'):submission.kind==='error'?errors[submission.reason]:t('使用 24 小时制，按确认的实际时刻发布。','24-hour clock. Publishing uses the confirmed instant.')}</p>
    {notice?<p className="muted">{t('仅切换显示时区，实际发布时间未变。','Only the display time zone changed. The publishing instant is unchanged.')}</p>:null}
    {value.instant?<ScheduledTimePreview instant={value.instant} zoneId={value.zoneId} rules={rules}/>:null}
  </section>;
}
