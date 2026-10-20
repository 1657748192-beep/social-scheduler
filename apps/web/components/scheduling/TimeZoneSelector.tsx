"use client";
import {useId,useState} from 'react';
import {searchTimeZones, timeZoneEntries, type TimeZoneEntry} from '../../lib/timezoneCatalog';
import {useLanguage} from '../LanguageProvider';

type Props = {value:string; onChange:(id:string)=>void; favorites:string[]; onToggleFavorite:(id:string)=>void; favoritesReady?:boolean};
export function TimeZoneSelector({value,onChange,favorites,onToggleFavorite,favoritesReady=true}:Props) {
  const {locale,t} = useLanguage(), id = useId();
  const [open,setOpen] = useState(false), [query,setQuery] = useState(''), [index,setIndex] = useState(-1);
  const label = (entry:TimeZoneEntry) => `${locale === 'zh-CN' ? entry.countryZh : entry.countryEn} / ${locale === 'zh-CN' ? entry.cityZh : entry.cityEn} / ${entry.zoneId}`;
  const selected = timeZoneEntries.find(e=>e.zoneId===value);
  const entries = searchTimeZones(query).sort((a,b)=>Number(favorites.includes(b.zoneId))-Number(favorites.includes(a.zoneId)));
  const options = entries.slice(0,60);
  function choose(zone:string){onChange(zone);setOpen(false);setQuery('');setIndex(-1);}
  return <div className="schedule-zone-selector" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOpen(false);}}>
    <label className="field" htmlFor={id}>{t('发布地区与时区','Publishing region and time zone')}</label>
    <div className="schedule-zone-search">
      <input id={id} role="combobox" aria-label={t('发布地区与时区','Publishing region and time zone')} aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open&&index>=0?`${id}-${index}`:undefined}
        value={open?query:(selected?label(selected):value)} autoComplete="off"
        placeholder={t('搜索国家、城市或时区','Search country, city or time zone')}
        onFocus={()=>{setOpen(true);setQuery('');setIndex(-1);}}
        onChange={event=>{setQuery(event.target.value);setOpen(true);setIndex(-1);}}
        onKeyDown={event=>{
          if(event.key==='Escape'){setOpen(false);setIndex(-1);return;}
          if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);setIndex(current=>event.key==='ArrowDown'?Math.min(current+1,options.length-1):Math.max(0,current-1));}
          if(event.key==='Enter'&&open){event.preventDefault();if(options[index])choose(options[index].zoneId);}
        }}/>
      <button type="button" className="button secondary" disabled={!favoritesReady} aria-label={favorites.includes(value)?t('取消收藏当前时区','Remove current time zone from favorites'):t('收藏当前时区','Favorite current time zone')} onClick={()=>onToggleFavorite(value)}>{favorites.includes(value)?'★':'☆'}</button>
    </div>
    {open?<div className="schedule-zone-results"><ul id={`${id}-list`} role="listbox" aria-label={t('时区选项','Time zone options')}>
      {options.map((entry,i)=><li key={`${entry.countryCode}:${entry.zoneId}`} id={`${id}-${i}`} role="option" aria-selected={i===index}>
        <button type="button" onMouseDown={event=>event.preventDefault()} onClick={()=>choose(entry.zoneId)}>{favorites.includes(entry.zoneId)?'★ ':''}{label(entry)}</button>
      </li>)}
    </ul>{!options.length?<p className="muted">{t('未找到，请选择适用的代表城市。','No match. Choose a representative city in the applicable region.')}</p>:null}
    {entries.length>60?<p className="muted">{t('输入国家、城市或 IANA 标识缩小范围。','Search by country, city or IANA ID to narrow the list.')}</p>:null}</div>:null}
  </div>;
}
