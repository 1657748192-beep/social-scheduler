"use client";
import React, { useEffect, useRef, useState } from "react";
import { apiRequest, type TikTokAccountStats, type TikTokPostMetrics } from "../../lib/api";
import { useLanguage } from "../LanguageProvider";
import { TikTokAccountStatsSummary } from "./TikTokAccountStatsPanel";
import { TikTokMetricsSummary } from "../posts/TikTokMetricsSummary";

type Status = { eligible: boolean; connected: boolean };
type Item = { id: string; videoId: string; text: string };
type Action = "connect" | "disconnect" | "stats" | "posts" | "more" | "metrics";
type ViewProps = { status: Status; busy: boolean; error: string; posts: Item[]; selected: string; nextCursor: string | null;
  stats: TikTokAccountStats | null; metrics: TikTokPostMetrics | null; onAction(action: Action): void; onSelect(id: string): void; t(zh: string, en: string): string };
export function TikTokSandboxView(p: ViewProps) {
  if (!p.status.eligible) return null;
  const { t } = p;
  return <section className="panel" aria-label={t("TikTok Sandbox 数据测试", "TikTok Sandbox metrics test")} aria-busy={p.busy}>
    <h2>{t("TikTok Sandbox 数据测试", "TikTok Sandbox metrics test")}</h2>
    <p>andypeng97 · {t("只读测试，不更改正式发布授权。", "Read-only testing; production publishing authorization is unchanged.")}</p>
    <button className="button secondary" disabled={p.busy} onClick={() => p.onAction("connect")}>{t("连接测试授权", "Connect sandbox")}</button>
    {p.status.connected ? <>
      <button className="button secondary" disabled={p.busy} onClick={() => p.onAction("disconnect")}>{t("断开测试连接", "Disconnect sandbox")}</button>
      <button className="button secondary" disabled={p.busy} onClick={() => p.onAction("stats")}>{t("刷新账号统计", "Refresh account statistics")}</button>
      {p.stats ? <TikTokAccountStatsSummary result={p.stats} t={t} /> : null}
      <h3>{t("本软件发布的公开视频", "Public videos published by this software")}</h3>
      <button className="button secondary" disabled={p.busy} onClick={() => p.onAction("posts")}>{t("读取已发布帖子", "Load published posts")}</button>
      <select aria-label={t("选择测试帖子", "Select test post")} disabled={p.busy} value={p.selected} onChange={e => p.onSelect(e.target.value)}>
        <option value="">{t("请选择帖子", "Select a post")}</option>
        {p.posts.map(post => <option key={post.id} value={post.id}>{post.text || post.videoId || post.id}{!post.videoId ? t("（待查询视频 ID）", " (video ID lookup pending)") : ""}</option>)}
      </select>
      {p.nextCursor ? <button className="button secondary" disabled={p.busy} onClick={() => p.onAction("more")}>{t("更多", "More")}</button> : null}
      <button className="button secondary" disabled={p.busy || !p.selected} onClick={() => p.onAction("metrics")}>{t("刷新视频数据", "Refresh video metrics")}</button>
      {p.posts.some(post => post.id === p.selected && !post.videoId) ? <p className="muted">{t("此记录已发布。点击刷新视频数据，将查询真实视频 ID；不会重新发布视频。", "This record is published. Refresh video metrics to look up its actual video ID; this will not republish the video.")}</p> : null}
      {p.metrics ? <TikTokMetricsSummary result={p.metrics} t={t} /> : null}
    </> : null}
    {p.error ? <p role="alert" className="notice">{p.error}</p> : null}
  </section>;
}
export function TikTokSandboxPanel(props: { token: string; workspaceId: string }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  useEffect(() => { setSearch(window.location.search); }, []);
  // Remount on tenant/session changes: in-flight requests cannot update the new tenant UI.
  return <><TikTokSandboxOutcome search={search} t={t} /><SandboxConnection key={`${props.workspaceId}:${props.token}`} {...props} /></>;
}
export function TikTokSandboxOutcome({ search, t }: { search: string; t(zh: string, en: string): string }) {
  const result = new URLSearchParams(search).get("tiktok_sandbox");
  if (result === "failed") return <p role="alert" className="notice">{t(
    "本次 TikTok 测试授权失败。请确认登录 andypeng97 并同意全部测试权限，再重新连接。已有授权不会被本次失败覆盖。",
    "TikTok sandbox authorization failed. Sign in as andypeng97, allow all test permissions, and reconnect. This failed attempt did not replace an existing authorization."
  )}</p>;
  if (result === "connected") return <p role="status" className="notice">{t(
    "TikTok 测试授权已完成。请在对应工作区手动读取数据；正式发布授权未更改。",
    "TikTok sandbox authorization completed. Load data manually in the matching workspace; production publishing authorization is unchanged."
  )}</p>;
  return null;
}
function SandboxConnection({ token, workspaceId }: { token: string; workspaceId: string }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<Status>({ eligible: false, connected: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [posts, setPosts] = useState<Item[]>([]), [selected, setSelected] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [stats, setStats] = useState<TikTokAccountStats | null>(null), [metrics, setMetrics] = useState<TikTokPostMetrics | null>(null);
  const active = useRef(false), running = useRef(false);
  const base = `/workspaces/${encodeURIComponent(workspaceId)}/tiktok-sandbox`;
  useEffect(() => {
    active.current = true; let canceled = false;
    apiRequest<Status>(`${base}/status`, { token }).then(value => { if (!canceled) setStatus(value); }).catch(() => {});
    return () => { canceled = true; active.current = false; };
  }, [base, token]);
  async function action(kind: Action) {
    if (running.current) return;
    running.current = true; setBusy(true); setError("");
    if (kind === "stats") setStats(null);
    if (kind === "metrics") setMetrics(null);
    if (kind === "disconnect") { setStats(null); setMetrics(null); setPosts([]); setSelected(""); setNextCursor(null); }
    try {
      if (kind === "connect") {
        const result = await apiRequest<{ authorizationUrl: string }>(`${base}/oauth/start`, { token, method: "POST" });
        if (active.current) window.location.assign(result.authorizationUrl);
      } else if (kind === "disconnect") {
        await apiRequest(`${base}/connection`, { token, method: "DELETE" });
        if (active.current) setStatus({ eligible: true, connected: false });
      } else if (kind === "stats") {
        const result = await apiRequest<TikTokAccountStats>(`${base}/stats`, { token }); if (active.current) setStats(result);
      } else if (kind === "metrics") {
        const result = await apiRequest<TikTokPostMetrics>(`${base}/posts/${encodeURIComponent(selected)}/metrics`, { token }); if (active.current) setMetrics(result);
      } else {
        const cursor = kind === "more" && nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : "";
        const result = await apiRequest<{ items: Item[]; nextCursor: string | null }>(`${base}/posts${cursor}`, { token });
        if (active.current) {
          setPosts(old => kind === "more" ? [...old, ...result.items] : result.items); setNextCursor(result.nextCursor);
          if (kind === "posts") { setSelected(""); setMetrics(null); }
          if (!result.items.length && !result.nextCursor) setError(t("没有可读取的公开视频记录；这不代表数据为零。", "No eligible public video records; this does not mean zero activity."));
        }
      }
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : t("测试请求失败，请重试。", "Test request failed. Retry.")); }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  return <TikTokSandboxView {...{ status, busy, error, posts, selected, nextCursor, stats, metrics, t }}
    onAction={kind => void action(kind)} onSelect={id => { setSelected(id); setMetrics(null); }} />;
}
