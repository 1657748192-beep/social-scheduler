"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppLocale = "zh-CN" | "en";

type LanguageContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (chinese: string, english: string) => string;
};

const storageKey = "social_scheduler_locale";

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>("zh-CN");

  useEffect(() => {
    const savedLocale = window.localStorage.getItem(storageKey);

    if (savedLocale === "en" || savedLocale === "zh-CN") {
      setLocale(savedLocale);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(storageKey, locale);
  }, [locale]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale,
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
