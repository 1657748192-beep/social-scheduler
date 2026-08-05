import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Social Scheduler | Plan and publish social content",
  description:
    "Social Scheduler helps creators and businesses connect social accounts, prepare original content, schedule posts, and review publishing results."
};

const features = [
  {
    eyebrow: "CREATE",
    title: "Prepare content with confidence",
    description:
      "Write post copy, add an optional website link, upload your original images or videos, and tailor content for each selected platform."
  },
  {
    eyebrow: "CONNECT",
    title: "Connect only accounts you authorize",
    description:
      "Users start authorization from Social Scheduler and approve access on each platform's official OAuth page. Social Scheduler never collects platform passwords."
  },
  {
    eyebrow: "SCHEDULE",
    title: "Review before publishing",
    description:
      "Choose the publishing account, time, privacy, and interaction settings before confirming a publishing task. Results remain visible in the calendar and post manager."
  }
];

export default function HomePage() {
  return (
    <main className="public-site">
      <header className="public-header">
        <Link className="public-brand" href="/" aria-label="Social Scheduler home">
          <span className="public-brand-mark">S</span>
          <span>
            <strong>Social Scheduler</strong>
          </span>
        </Link>

        <nav className="public-nav" aria-label="Public site navigation">
          <a href="#features">Features</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link className="public-sign-in" href="/login">
            Sign in
          </Link>
        </nav>
      </header>

      <section className="public-hero" aria-labelledby="public-hero-title">
        <div>
          <p className="public-kicker">SOCIAL MEDIA CONTENT WORKSPACE</p>
          <h1 id="public-hero-title">Plan original content. Publish with control.</h1>
          <p className="public-lead">
            Social Scheduler is a web workspace for creators and businesses to connect authorized social accounts,
            create original posts, schedule publishing, and review results in one place.
          </p>
          <div className="public-hero-actions">
            <Link className="button" href="/login">
              Sign in to Social Scheduler
            </Link>
            <Link className="button secondary" href="/register">
              Create an account
            </Link>
          </div>
          <p className="public-note">Platform passwords are entered only on the platform&apos;s official authorization page.</p>
        </div>

        <aside className="public-workflow" aria-label="How Social Scheduler works">
          <p>HOW IT WORKS</p>
          <ol>
            <li>
              <span>1</span>
              <div>
                <strong>Connect a channel</strong>
                <small>Authorize an account on the platform&apos;s official OAuth page.</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Create your post</strong>
                <small>Add original media, copy, and account-specific settings.</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Confirm publishing</strong>
                <small>Review the target account and publish now or schedule it.</small>
              </div>
            </li>
          </ol>
        </aside>
      </section>

      <section className="public-feature-section" id="features" aria-labelledby="public-features-title">
        <div className="public-section-heading">
          <p className="public-kicker">BUILT FOR RESPONSIBLE PUBLISHING</p>
          <h2 id="public-features-title">A clear workflow from authorization to result.</h2>
        </div>
        <div className="public-feature-grid">
          {features.map((feature) => (
            <article className="public-feature-card" key={feature.title}>
              <p>{feature.eyebrow}</p>
              <h3>{feature.title}</h3>
              <span>{feature.description}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="public-platform-section" aria-label="Supported social platforms">
        <p>SUPPORTED WORKFLOW</p>
        <div>
          <span>Instagram</span>
          <span>TikTok</span>
          <span>Facebook</span>
          <span>YouTube</span>
          <span>Pinterest</span>
          <span>LinkedIn</span>
        </div>
        <small>Available connections and publishing capabilities depend on each platform&apos;s account type, permissions, and review status.</small>
      </section>

      <footer className="public-footer">
        <div>
          <strong>Social Scheduler</strong>
          <span>Content planning and publishing workspace.</span>
        </div>
        <nav aria-label="Legal links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/data-deletion">Data Deletion</Link>
          <a href="mailto:1657748192@qq.com">Contact</a>
        </nav>
      </footer>
    </main>
  );
}
