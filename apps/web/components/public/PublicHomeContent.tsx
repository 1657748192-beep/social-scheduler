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

      <section aria-label={text.platformTitle} className="public-platform-section">
        <p>{text.platformTitle}</p>
        <div>{platforms.map((platform) => <span key={platform}>{platform}</span>)}</div>
        <small>{text.platformNote}</small>
        <small className="public-region-note">{text.tiktokNotice}</small>
      </section>
    </>
  );
}
