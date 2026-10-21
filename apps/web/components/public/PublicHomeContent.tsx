import Link from "next/link";
import type { PublicLocale } from "./PublicSiteChrome";

const copy = {
  "zh-CN": {
    kicker: "社交媒体内容工作台",
    title: "规划原创内容，掌握发布节奏。",
    lead: "Social Scheduler 是面向创作者和企业的网页工作台，可连接已授权的社交账号、创建原创帖子、安排发布时间，并在一个位置查看发布结果。",
    signIn: "登录 Social Scheduler",
    register: "创建账号",
    passwordNote: "平台密码仅在平台官方授权页面输入。",
    workflowTitle: "使用步骤",
    workflow: [
      ["连接通道", "在平台官方 OAuth 授权页面中授权账号。"],
      ["创建内容", "添加原创图片、视频、文案和账号专属设置。"],
      ["确认发布", "核对目标账号后立即发布，或安排定时发布。"]
    ],
    responsibleKicker: "为负责任的发布而设计",
    responsibleTitle: "从授权到结果，流程清晰可见。",
    features: [
      ["创建", "安心准备内容", "撰写帖子文案、添加可选网站链接、上传原创图片或视频，并为每个已选择的平台单独调整内容。"],
      ["连接", "仅连接你授权的账号", "用户从 Social Scheduler 发起授权，并在各平台的官方 OAuth 页面确认。Social Scheduler 不会收集平台密码。"],
      ["排程", "发布前再次确认", "确认发布任务前选择账号、时间、隐私和互动设置；结果会保留在日历和帖子管理中。"]
    ],
    platformTitle: "支持的工作流",
    platformNote: "可连接的平台和发布能力取决于各平台的账号类型、权限和审核状态。",
    tiktokNotice: "TikTok 功能仅面向中国大陆以外的用户和企业。"
  },
  en: {
    kicker: "SOCIAL MEDIA CONTENT WORKSPACE",
    title: "Plan original content. Publish with control.",
    lead: "Social Scheduler is a web workspace for creators and businesses to connect authorized social accounts, create original posts, schedule publishing, and review results in one place.",
    signIn: "Sign in to Social Scheduler",
    register: "Create an account",
    passwordNote: "Platform passwords are entered only on the platform's official authorization page.",
    workflowTitle: "HOW IT WORKS",
    workflow: [
      ["Connect a channel", "Authorize an account on the platform's official OAuth page."],
      ["Create your post", "Add original media, copy, and account-specific settings."],
      ["Confirm publishing", "Review the target account and publish now or schedule it."]
    ],
    responsibleKicker: "BUILT FOR RESPONSIBLE PUBLISHING",
    responsibleTitle: "A clear workflow from authorization to result.",
    features: [
      ["CREATE", "Prepare content with confidence", "Write post copy, add an optional website link, upload your original images or videos, and tailor content for each selected platform."],
      ["CONNECT", "Connect only accounts you authorize", "Users start authorization from Social Scheduler and approve access on each platform's official OAuth page. Social Scheduler never collects platform passwords."],
      ["SCHEDULE", "Review before publishing", "Choose the publishing account, time, privacy, and interaction settings before confirming a publishing task. Results remain visible in the calendar and post manager."]
    ],
    platformTitle: "SUPPORTED WORKFLOW",
    platformNote: "Available connections and publishing capabilities depend on each platform's account type, permissions, and review status.",
    tiktokNotice: "TikTok features are available only to users and businesses outside Mainland China."
  }
} as const;

const platforms = ["Instagram", "TikTok", "Facebook", "YouTube", "Pinterest", "LinkedIn"];

export function PublicHomeContent({ locale }: { locale: PublicLocale }) {
  const text = copy[locale];

  return (
    <>
      <section aria-labelledby="public-hero-title" className="public-hero">
        <div>
          <p className="public-kicker">{text.kicker}</p>
          <h1 id="public-hero-title">{text.title}</h1>
          <p className="public-lead">{text.lead}</p>
          <div className="public-hero-actions">
            <Link className="button" href="/login">
              {text.signIn}
            </Link>
            <Link className="button secondary" href="/register">
              {text.register}
            </Link>
          </div>
          <p className="public-note">{text.passwordNote}</p>
        </div>

        <aside aria-label={text.workflowTitle} className="public-workflow">
          <p>{text.workflowTitle}</p>
          <ol>
            {text.workflow.map(([title, description], index) => (
              <li key={title}>
                <span>{index + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section aria-labelledby="public-features-title" className="public-feature-section" id="features">
        <div className="public-section-heading">
          <p className="public-kicker">{text.responsibleKicker}</p>
          <h2 id="public-features-title">{text.responsibleTitle}</h2>
        </div>
        <div className="public-feature-grid">
          {text.features.map(([eyebrow, title, description]) => (
            <article className="public-feature-card" key={title}>
              <p>{eyebrow}</p>
              <h3>{title}</h3>
              <span>{description}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="public-product-tour" id="product-tour" aria-labelledby="product-tour-title">
        <div className="public-section-heading">
          <p className="public-kicker">{locale === 'en' ? 'INSIDE THE WORKSPACE' : '走进真实工作台'}</p>
          <h2 id="product-tour-title">{locale === 'en' ? 'See the tools before you sign in.' : '登录之前，先了解实际操作界面。'}</h2>
          <p>{locale === 'en' ? 'Screenshots of the actual application with Demo data. No customer information is shown; these are not proof of a live post or platform approval.' : '以下为实际软件界面截图，使用演示数据，不展示客户信息；不代表真实发布结果或平台审核通过。'}</p>
        </div>
        <div className="public-tour-grid">
          <figure>
            <a href="/product/accounts-en.png" target="_blank" rel="noopener noreferrer"><img src="/product/accounts-en.png" width="1440" height="1000" loading="lazy" alt={locale === 'en' ? 'Actual social account manager with demo accounts; filter accounts by platform.' : '真实社交账号管理界面，使用演示账号，可按平台筛选。'}/></a>
            <figcaption><h3>{locale === 'en' ? '1. Choose the right account' : '1. 选择正确的发布账号'}</h3><p>{locale === 'en' ? 'Open Social accounts to connect through official authorization, filter by platform, and review each account before publishing.' : '进入社交账号，通过官方页面授权，按平台筛选，并在发布前核对目标账号。'}</p></figcaption>
          </figure>
          <figure>
            <a href="/product/composer-en.png" target="_blank" rel="noopener noreferrer"><img src="/product/composer-en.png" width="1440" height="1000" loading="lazy" alt={locale === 'en' ? 'Actual content editor with demo data, account selection and publishing controls.' : '真实内容编辑界面，使用演示数据，展示账号选择及发布设置。'}/></a>
            <figcaption><h3>{locale === 'en' ? '2. Prepare, review and confirm' : '2. 编辑、检查并确认发布'}</h3><p>{locale === 'en' ? 'Use Content editor to prepare original media and captions. Choose publish now or a schedule, review platform-specific options, and confirm. Follow task status in Content calendar and Post manager.' : '在内容编辑中准备原创素材和文案，选择立即发布或定时发布，检查平台专属设置并确认；随后在排程日历和帖子管理中查看任务状态。'}</p></figcaption>
          </figure>
        </div>
      </section>

      <section className="public-profile-explainer" aria-labelledby="public-profile-title">
        <p className="public-kicker">TIKTOK · <code>user.info.profile</code></p>
        <h2 id="public-profile-title">{locale === 'en' ? 'Recognize the account you authorized.' : '清楚识别你已授权的账号。'}</h2>
        <p>{locale === 'en' ? 'Optional profile access reads the authorized TikTok account’s username and profile link, helping users identify the account and open its official profile. Avatar and display-name access belongs to user.info.basic, not this additional permission.' : '可选的资料权限用于读取已授权 TikTok 账号的用户名和主页链接，帮助用户识别账号并打开其官方主页。头像和显示名称属于 user.info.basic，不属于这项新增权限。'}</p>
        <p>{locale === 'en' ? 'This read-only access does not grant publishing, comment or direct-message access. Availability requires TikTok approval and user consent; additional profile access is not yet approved for general availability.' : '这只是资料读取权限，不授予发布、评论或私信权限。使用需平台审核通过并获得用户同意；新增资料权限尚待审核通过，未向全部用户开放。'}</p>
        <Link href={locale === 'en' ? '/en/privacy' : '/privacy'}>{locale === 'en' ? 'Read how authorized data is used and deleted →' : '查看授权数据的用途与删除方式 →'}</Link>
      </section>

      <section aria-label={text.platformTitle} className="public-platform-section">
        <p>{text.platformTitle}</p>
        <div>{platforms.map((platform) => <span key={platform}>{platform}</span>)}</div>
        <small>{text.platformNote}</small>
        <small className="public-region-note">{text.tiktokNotice}</small>
      </section>
    </>
  );
}
