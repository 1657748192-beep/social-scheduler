import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page">
      <section className="auth-card">
        <h1>Social Scheduler</h1>
        <p className="muted">Create an account, sign in, and schedule a demo publish job.</p>
        <div className="form">
          <Link className="button" href="/register">
            Create account
          </Link>
          <Link className="button secondary" href="/login">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
