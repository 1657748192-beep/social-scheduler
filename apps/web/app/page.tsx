import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page">
      <section className="auth-card">
        <h1>社交内容排程后台</h1>
        <p className="muted">登录后创建内容、绑定社交账号，并安排定时发布。</p>
        <div className="form">
          <Link className="button" href="/register">
            创建账号
          </Link>
          <Link className="button secondary" href="/login">
            登录
          </Link>
        </div>
      </section>
    </main>
  );
}
