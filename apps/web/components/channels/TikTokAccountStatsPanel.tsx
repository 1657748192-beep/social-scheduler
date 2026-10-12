"use client";

import React, { useEffect, useRef, useState } from "react";
import { apiRequest, type TikTokAccountStats } from "../../lib/api";
import { useLanguage } from "../LanguageProvider";

export function TikTokAccountStatsSummary({ result, t }: { result: TikTokAccountStats; t: (zh: string, en: string) => string }) {
  if (result.status === "ok") return <div>
    <dl className="tiktok-metrics-grid">
      <div><dt>{t("粉丝数", "Followers")}</dt><dd>{result.followerCount}</dd></div>
      <div><dt>{t("关注数", "Following")}</dt><dd>{result.followingCount}</dd></div>
      <div><dt>{t("累计获赞数", "Total likes")}</dt><dd>{result.likesCount}</dd></div>
      <div><dt>{t("公开视频数", "Public videos")}</dt><dd>{result.videoCount}</dd></div>
    </dl>
    <p className="muted">{t("账号整体数据，不限于本软件发布的视频。", "Account-wide totals, including videos published outside this service.")}</p>
    <p className="muted">{t("读取时间", "Fetched at")}: <time dateTime={result.fetchedAt}>{new Date(result.fetchedAt).toLocaleString()}</time>{t(" · 平台数据可能存在延迟", " · Platform counts may be delayed")}</p>
  </div>;
  const messages = {
    permission_missing: t("此账号当前授权尚未包含账号统计权限（user.info.stats）。请由工作区管理员点击“补充数据授权”，使用同一个 TikTok 账号完成授权；此提示不影响原有发布功能。", "This account's current authorization does not include user.info.stats. Ask a workspace administrator to use Authorize data access with the same TikTok account. This notice does not affect existing publishing."),
    authorization_required: t("暂时无法获取有效授权，请检查此账号连接后重试。", "A valid authorization is unavailable. Check this account connection and retry."),
    rate_limited: t("TikTok 请求过于频繁，请稍后刷新。", "TikTok is rate limiting requests. Refresh later."),
    temporarily_unavailable: t("TikTok 数据暂时不可用，请稍后重试。", "TikTok data is temporarily unavailable. Try again later."),
    data_unavailable: t("TikTok 未返回此账号的完整统计数据，这不代表数据为零。", "TikTok did not return complete statistics for this account. This does not mean zero activity."),
    account_unavailable: t("此账号未连接或授权不可用，请检查账号状态。", "This account is disconnected or unavailable. Check its status.")
  };
  return <p className="notice">{messages[result.status]}</p>;
}

export function TikTokAccountStatsPanel({ token, workspaceId, accountId, onAuthorize, grantedScopes = [] }: { token: string; workspaceId: string; accountId: string; onAuthorize?: () => void; grantedScopes?: string[] }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TikTokAccountStats | null>(null);
  const version = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => () => { version.current += 1; }, []);
  async function load() {
    if (inFlight.current) return;
    inFlight.current = true;
    const request = ++version.current;
    setLoading(true); setResult(null);
    try {
      const data = await apiRequest<TikTokAccountStats>(`/workspaces/${encodeURIComponent(workspaceId)}/social-accounts/${encodeURIComponent(accountId)}/tiktok-stats`, { token });
      if (version.current === request) setResult(data);
    } catch {
      if (version.current === request) setResult({ status: "temporarily_unavailable" });
    } finally {
      inFlight.current = false;
      if (version.current === request) setLoading(false);
    }
  }
  return <section className="tiktok-account-stats" aria-label={t("TikTok 账号数据", "TikTok account statistics")}>
    {onAuthorize && !(grantedScopes.includes("user.info.stats") && grantedScopes.includes("video.list")) ? <div>
      <button type="button" className="button secondary" onClick={onAuthorize}>{t("补充数据授权", "Authorize data access")}</button>
    </div> : null}
    <button type="button" className="button secondary" aria-expanded={expanded} onClick={() => {
      setExpanded(!expanded);
      if (!expanded && !result && !loading) void load();
    }}>{expanded ? t("收起账号数据", "Hide account statistics") : t("查看账号数据", "View account statistics")}</button>
    {expanded ? <div aria-busy={loading}>
      <div className="row"><h3>{t("TikTok 账号概览", "TikTok account overview")}</h3>
        <button type="button" className="button secondary" disabled={loading} onClick={() => void load()}>{t("刷新", "Refresh")}</button></div>
      <div aria-live="polite">{loading ? <p>{t("正在读取数据…", "Loading statistics…")}</p> : null}
        {result ? <TikTokAccountStatsSummary result={result} t={t} /> : null}</div>
    </div> : null}
  </section>;
}
