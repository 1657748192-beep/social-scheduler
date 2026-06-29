"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest, type OAuthAuthorizationLink } from "../../../../lib/api";

function formatChinaTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(new Date(value));
}

export default function OAuthSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [link, setLink] = useState<OAuthAuthorizationLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      return;
    }

    apiRequest<OAuthAuthorizationLink>(`/integrations/oauth/share/${token}`)
      .then((response) => {
        setLink(response);
        setError(null);
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "授权链接不可用");
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <main className="share-auth-page">
      <section className="share-auth-card">
        <div className="brand-mark">S</div>
        <p className="section-kicker">账号授权</p>
        {loading ? (
          <>
            <h1>正在读取授权链接</h1>
            <p className="muted">请稍等。</p>
          </>
        ) : error || !link ? (
          <>
            <h1>授权链接不可用</h1>
            <p className="muted">{error ?? "链接不存在或已经失效。"}</p>
          </>
        ) : link.expired ? (
          <>
            <h1>授权链接已过期</h1>
            <p className="muted">这个分享链接有效期为 24 小时，请联系管理员重新生成。</p>
          </>
        ) : (
          <>
            <h1>连接到 {link.displayName} 账号</h1>
            <p className="muted">
              授权后账号会绑定到工作区「{link.workspace.name}」，链接将在北京时间{" "}
              {formatChinaTime(link.expiresAt)} 失效。
            </p>
            <a className="button share-auth-primary" href={link.startUrl}>
              开始平台授权
            </a>
            <p className="share-auth-note">授权过程由平台官方 OAuth 页面完成，本页不会保存你的平台密码。</p>
          </>
        )}
      </section>
    </main>
  );
}
