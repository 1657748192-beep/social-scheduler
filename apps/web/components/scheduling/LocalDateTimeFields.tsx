"use client";
import {useId} from 'react';
import {useLanguage} from '../LanguageProvider';
export function LocalDateTimeFields({value,onChange,minDate,descriptionId}:{value:string;onChange:(v:string)=>void;minDate?:string;descriptionId?:string}){
  const {t}=useLanguage(), id=useId();
  const [date='',clock='00:00']=value.split('T'), [hour='00',minute='00']=clock.split(':');
  const update=(d:string,h:string,m:string)=>onChange(d?`${d}T${h}:${m}`:'');
  return <div className="field"><label htmlFor={id}>{t('当地日期与时间','Local date and time')}</label><div className="beijing-datetime-picker">
    <input id={id} aria-label={t('当地日期','Local date')} aria-describedby={descriptionId} type="date" value={date} min={minDate||undefined} onChange={e=>update(e.target.value,hour,minute)}/>
    <select aria-label={t('当地小时','Local hour')} disabled={!date} value={hour} onChange={e=>update(date,e.target.value,minute)}>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v}>{v}</option>)}</select><span className="beijing-datetime-separator">:</span>
    <select aria-label={t('当地分钟','Local minute')} disabled={!date} value={minute} onChange={e=>update(date,hour,e.target.value)}>{Array.from({length:60},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v}>{v}</option>)}</select>
  </div></div>;
}
