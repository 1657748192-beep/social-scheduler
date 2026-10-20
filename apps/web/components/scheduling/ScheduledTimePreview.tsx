"use client";
import {formatScheduleTimes} from '../../lib/scheduleTimeZone';
import {useLanguage} from '../LanguageProvider';
export function ScheduledTimePreview({instant,zoneId}:{instant:string;zoneId?:string}){
  const {locale,t}=useLanguage(), value=formatScheduleTimes(instant,zoneId,locale);
  return <div className="schedule-time-preview" aria-live="polite">
    {value.localLabel?<div><span>{t('目标地区时间','Target local time')}</span><strong>{value.localLabel}</strong><small>{zoneId}</small></div>:<p className="muted">{t('原时区不可用或未记录，仅显示北京时间。','Original time zone unavailable or not recorded. Showing Beijing time only.')}</p>}
    <div><span>{t('对应北京时间','Corresponding Beijing time')}</span><strong>{value.beijingLabel}</strong>
      {value.dayDelta!==0?<small>{value.dayDelta===1?t('北京时间次日','Next day in Beijing'):value.dayDelta===-1?t('北京时间前一日','Previous day in Beijing'):t(`北京日期相差 ${value.dayDelta} 天`,`Beijing date differs by ${value.dayDelta} days`)}</small>:null}
    </div>
  </div>;
}
