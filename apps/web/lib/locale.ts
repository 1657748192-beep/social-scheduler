export type AppLocale = 'zh-CN' | 'en';
export const localeKey = 'social_scheduler_locale';
export function validLocale(value:unknown):AppLocale|undefined {
  return value==='en'||value==='zh-CN'?value:undefined;
}

// Runs before body paint. Legacy localStorage-only preferences are concealed until
// React has adopted them; cookie-backed requests already render the right HTML.
export const localeBootstrap = `(()=>{try{const k='social_scheduler_locale',v=x=>x==='en'||x==='zh-CN';let l=null;try{const c=document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(k+'=')),s=c?c.slice(k.length+1):null;if(v(s))l=s;}catch{}if(!l){try{const x=localStorage.getItem(k);if(v(x))l=x;}catch{}}if(l&&l!==document.documentElement.lang)document.documentElement.setAttribute('data-locale-pending','');}catch{}})();`;
