"use client";
import {useEffect, useState} from 'react';
import {apiRequest} from '../../lib/api';
import {canonicalTimeZone} from '../../lib/timezoneCatalog';

type Favorites = {token:string; workspaceId:string; key:string; values:string[]; persistent:boolean};
export function useTimeZoneFavorites(token:string, workspaceId:string) {
  const [state,setState] = useState<Favorites|null>(null);
  const [limitReached,setLimitReached] = useState(false);
  useEffect(() => {
    let current = true;
    const abort = new AbortController();
    setLimitReached(false);
    if (token && workspaceId) void apiRequest<{id:string}>('/auth/me', {token, signal:abort.signal}).then(user => {
      if (!current || !user.id || typeof user.id !== 'string') return;
      const key = `schedule-timezones:v1:${encodeURIComponent(user.id)}:${encodeURIComponent(workspaceId)}`;
      let values:string[] = [], persistent = true;
      try {
        const raw:unknown = JSON.parse(window.localStorage.getItem(key) || '[]');
        if (Array.isArray(raw)) values = [...new Set(raw.filter((id):id is string => typeof id === 'string').map(id => canonicalTimeZone(id)).filter((id):id is string => id !== null))].slice(0,8);
      } catch { persistent = false; }
      setState({token,workspaceId,key,values,persistent});
    }).catch(() => { if (current) setState(null); });
    return () => { current = false; abort.abort(); };
  },[token, workspaceId]);
  const active = state && state.token === token && state.workspaceId === workspaceId ? state : null;
  function toggle(id:string) {
    const canonical = canonicalTimeZone(id);
    if (!canonical || !active) return;
    if (!active.values.includes(canonical) && active.values.length >= 8) { setLimitReached(true); return; }
    const values = active.values.includes(canonical) ? active.values.filter(v => v !== canonical) : [...active.values,canonical];
    let persistent = active.persistent;
    try { window.localStorage.setItem(active.key,JSON.stringify(values)); } catch { persistent = false; }
    setState({...active,values,persistent}); setLimitReached(false);
  }
  return {favorites:active?.values ?? [],toggle,persistent:active?.persistent ?? false,ready:Boolean(active),limitReached};
}
