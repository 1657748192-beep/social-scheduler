"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {localeKey,validLocale,type AppLocale} from '../lib/locale';

export type {AppLocale} from '../lib/locale';

type LanguageContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (chinese: string, english: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function persistLocale(locale:AppLocale){
  try{window.localStorage.setItem(localeKey,locale);}catch{/* A blocked storage must not prevent switching. */}
  try{document.cookie=`${localeKey}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${window.location?.protocol==='https:'?'; Secure':''}`;}catch{/* localStorage remains the fallback when cookies are blocked. */}
}

export function LanguageProvider({ children,initialLocale='zh-CN' }: { children: ReactNode; initialLocale?:AppLocale }) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);
  const [ready,setReady]=useState(false);

  useEffect(() => {
    let savedLocale:AppLocale|undefined;
    try{const cookie=(document.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(localeKey+'='));savedLocale=validLocale(cookie?.slice(localeKey.length+1));}catch{/* Cookie access can be blocked independently of storage. */}
    if(!savedLocale){try{savedLocale=validLocale(window.localStorage.getItem(localeKey));}catch{/* Keep usable with storage blocked. */}}
    const chosen=savedLocale??initialLocale;
    setLocaleState(chosen);
    persistLocale(chosen);
    setReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    if(ready)document.documentElement.removeAttribute?.('data-locale-pending');
  }, [locale,ready]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale:(next)=>{persistLocale(next);setLocaleState(next);},
      t: (chinese, english) => (locale === "en" ? english : chinese)
    }),
    [locale]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }

  return context;
}

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLanguage();

  return (
    <div className={compact ? "language-toggle compact" : "language-toggle"} aria-label="Language selector">
      <button
        aria-pressed={locale === "zh-CN"}
        className={locale === "zh-CN" ? "active" : ""}
        onClick={() => setLocale("zh-CN")}
        type="button"
      >
        中文
      </button>
      <button
        aria-pressed={locale === "en"}
        className={locale === "en" ? "active" : ""}
        onClick={() => setLocale("en")}
        type="button"
      >
        English
      </button>
    </div>
  );
}
