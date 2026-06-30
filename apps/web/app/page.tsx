import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">S</span>
          <div>
            <h1>Social Scheduler</h1>
            <p>Social media content scheduling dashboard</p>
          </div>
        </div>

        <p className="muted">
          Social Scheduler helps authorized users connect social channels, create content, and schedule posts.
        </p>

        <div className="form">
          <Link className="button" href="/register">
            Create account
          </Link>
          <Link className="button secondary" href="/login">
            Log in
          </Link>
        </div>
      </section>
    </main>
  );
}
