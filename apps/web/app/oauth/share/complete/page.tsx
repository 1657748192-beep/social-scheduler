import { platformLabel } from "../../../../lib/labels";

type CompletePageProps = {
  searchParams?: Promise<{
    platform?: string;
  }>;
};

export default async function OAuthShareCompletePage({ searchParams }: CompletePageProps) {
  const params = searchParams ? await searchParams : {};
  const platform = params.platform ?? "";

  return (
    <main className="share-auth-page">
      <section className="share-auth-card">
        <div className="brand-mark">S</div>
        <p className="section-kicker">授权完成</p>
        <h1>{platform ? `${platformLabel(platform)} 账号已连接` : "账号已连接"}</h1>
        <p className="muted">你可以关闭这个页面，管理员会在后台看到新绑定的账号。</p>
      </section>
    </main>
  );
}
