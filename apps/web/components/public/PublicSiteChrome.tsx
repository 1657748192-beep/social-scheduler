import Link from "next/link";

export type PublicLocale = "zh-CN" | "en";
export type PublicPage = "home" | "privacy" | "terms";

export const publicPaths = {
  "zh-CN": { home: "/", privacy: "/privacy", terms: "/terms" },
  "en": { home: "/en", privacy: "/en/privacy", terms: "/en/terms" }
} as const;

const labels = {
  "zh-CN": {
    features: "功能介绍",
    privacy: "隐私政策",
    terms: "服务条款",
    signIn: "登录",
    footerDescription: "内容规划与发布工作台。",
    dataDeletion: "数据删除",
    contact: "联系我们"
  },
  en: {
    features: "Features",
    privacy: "Privacy",
    terms: "Terms",
    signIn: "Sign in",
    footerDescription: "Content planning and publishing workspace.",
    dataDeletion: "Data Deletion",
    contact: "Contact"
  }
} as const;

function PublicLanguageLinks({ locale, page }: { locale: PublicLocale; page: PublicPage }) {
  return (
    <div aria-label="Language selector" className="public-language-links">
      <Link className={locale === "zh-CN" ? "active" : ""} href={publicPaths["zh-CN"][page]}>
        中文
      </Link>
      <Link className={locale === "en" ? "active" : ""} href={publicPaths.en[page]}>
        English
      </Link>
    </div>
  );
}

export function PublicHeader({ locale, page }: { locale: PublicLocale; page: PublicPage }) {
  const copy = labels[locale];
  const paths = publicPaths[locale];

  return (
    <header className="public-header">
      <Link aria-label="Social Scheduler home" className="public-brand" href={paths.home}>
        <span className="public-brand-mark">S</span>
        <span>
          <strong>Social Scheduler</strong>
        </span>
      </Link>

      <nav aria-label="Public site navigation" className="public-nav">
        <Link href={`${paths.home}#features`}>{copy.features}</Link>
        <Link href={paths.privacy}>{copy.privacy}</Link>
        <Link href={paths.terms}>{copy.terms}</Link>
        <PublicLanguageLinks locale={locale} page={page} />
        <Link className="public-sign-in" href="/login">
          {copy.signIn}
        </Link>
      </nav>
    </header>
  );
}

export function PublicFooter({ locale }: { locale: PublicLocale }) {
  const copy = labels[locale];
  const paths = publicPaths[locale];

  return (
    <footer className="public-footer">
      <div>
        <strong>Social Scheduler</strong>
        <span>{copy.footerDescription}</span>
      </div>
      <nav aria-label="Legal links">
        <Link href={paths.privacy}>{copy.privacy}</Link>
        <Link href={paths.terms}>{copy.terms}</Link>
        <Link href="/data-deletion">{copy.dataDeletion}</Link>
        <a href="mailto:1657748192@qq.com">{copy.contact}</a>
      </nav>
    </footer>
  );
}
