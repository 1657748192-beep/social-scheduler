import Link from "next/link";

const copy = {
  subtitle: "\u793e\u4ea4\u5a92\u4f53\u5185\u5bb9\u6392\u7a0b\u5de5\u4f5c\u53f0",
  description:
    "Social Scheduler \u53ef\u4ee5\u5e2e\u52a9\u5df2\u6388\u6743\u7528\u6237\u8fde\u63a5\u793e\u4ea4\u901a\u9053\u3001\u521b\u5efa\u5185\u5bb9\u5e76\u5b89\u6392\u5b9a\u65f6\u53d1\u5e03\u3002",
  createAccount: "\u521b\u5efa\u8d26\u53f7",
  login: "\u767b\u5f55"
};

export default function HomePage() {
  return (
    <main className="page">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">S</span>
          <div>
            <h1>Social Scheduler</h1>
            <p>{copy.subtitle}</p>
          </div>
        </div>

        <p className="muted">{copy.description}</p>

        <div className="form">
          <Link className="button" href="/register">
            {copy.createAccount}
          </Link>
          <Link className="button secondary" href="/login">
            {copy.login}
          </Link>
        </div>
      </section>
    </main>
  );
}
