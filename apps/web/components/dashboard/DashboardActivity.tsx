"use client";
import React, { useEffect, useState } from "react";
import type { DashboardOverview } from "../../lib/api";
import { startDashboardOverviewRequest } from "../../lib/dashboardOverviewRequest";
import { subscribeDashboardClock } from "../../lib/dashboardClock";
import { platformLabel, scheduleStatusLabel } from "../../lib/labels";
import { DashboardContentPanel } from "./DashboardContent";
import { PlatformLogo } from "../PlatformLogo";
export { DashboardContentView } from "./DashboardContent";

type ViewProps = { data: DashboardOverview | null; loading: boolean; failed: boolean; locale: "zh-CN" | "en"; timezone: string; userName?: string; now?: Date | null; children?: React.ReactNode; contentPanel?: React.ReactNode };
export function DashboardOverviewView({ data, loading, failed, locale, timezone, userName, now = null, children, contentPanel }: ViewProps) {
  const t = (zh: string, en: string) => locale === "en" ? en : zh;
  let safeTimezone = timezone;
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch { safeTimezone = "Asia/Shanghai"; }
  const date = now;
  const hour = date ? Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", hour: "numeric", hourCycle: "h23" }).format(date)) : null;
  const greeting = hour === null ? t("你好", "Hello") : hour < 5 ? t("夜深了", "It's late") : hour < 11 ? t("早上好", "Good morning") : hour < 13 ? t("中午好", "Good afternoon") : hour < 18 ? t("下午好", "Good afternoon") : t("晚上好", "Good evening");
  const metrics = [
    { label: t("已发布内容", "Published content"), value: data?.publishedCount, detail: t("按平台发布记录计数", "Counted per platform publication"), href: "/posts", symbol: "➤" },
    { label: t("待发布", "Pending publications"), value: data?.pendingCount, detail: t("已排程及发布中", "Scheduled and publishing"), href: "/calendar", symbol: "◷" },
    { label: t("我的草稿", "My drafts"), value: data?.draftCount, detail: t("有效保留期内的草稿", "Drafts within retention period"), href: "/drafts", symbol: "▤" },
    { label: t("已连接账号", "Connected accounts"), value: data?.connectedCount, detail: t("授权状态正常的账号", "Accounts with active authorization"), href: "#social-channels", symbol: "♧" }
  ];
  return <>
    <section className="dashboard-hero dashboard-welcome">
      <div><h2>{greeting}{userName ? `，${userName}!` : "!"}</h2><p className="muted">{t("在一个地方，轻松规划和发布你的社交媒体内容。", "Plan and publish your social content in one place.")}</p></div>
      <div className="dashboard-welcome-date">{date ? <time dateTime={date.toISOString()}>{date.toLocaleDateString(locale, { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric", weekday: "long" })}</time> : null}<small>{t("北京时间 · 当前工作区", "Beijing time · Current workspace")}</small></div>
    </section>
    <section className="metric-grid dashboard-content-metrics" aria-label={t("内容统计", "Content overview")}>
      {metrics.map((item, index) => <a className={`metric-card dashboard-content-metric metric-tone-${index}`} href={item.href} key={item.href}>
        <span className="metric-symbol" aria-hidden="true">{item.symbol}</span><div><strong>{item.value ?? "—"}</strong><span>{item.label}</span><small>{item.detail}</small></div>
      </a>)}
    </section>
    <div className="dashboard-overview-grid">
      {contentPanel ?? <section className="panel dashboard-upcoming">
        <div className="row"><h2>{t("即将发布", "Upcoming publications")}</h2><a className="text-button" href="/calendar">{t("查看全部 →", "View all →")}</a></div>
        <p className="muted">{t("当前工作区 · 最近 5 条待发布记录（含发布中及逾期排程）", "Current workspace · First 5 pending records, including publishing and overdue schedules")}</p>
        {failed ? <p className="error" role="alert">{t("暂时无法更新内容统计，将自动重试。", "Could not update content overview. Retrying automatically.")}</p> : null}
        {loading ? <p className="muted" role="status">{t("正在读取内容…", "Loading content…")}</p> : data && !data.upcoming.length ? <p className="muted">{t("暂无待发布内容", "No pending publications")}</p> : data ? <div className="dashboard-upcoming-scroll"><table className="dashboard-upcoming-table">
          <thead><tr>{[t("日期/时间", "Date / time"), t("内容", "Content"), t("平台", "Platform"), t("状态", "Status"), t("操作", "Actions")].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{data.upcoming.map(item => <tr key={item.id}>
            <td><time dateTime={item.scheduledAt}>{new Date(item.scheduledAt).toLocaleString(locale, { timeZone: safeTimezone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</time></td>
            <td><div className="dashboard-upcoming-content">{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" /> : <span className="dashboard-thumbnail-placeholder" aria-hidden="true">▤</span>}<div><strong>{item.title || item.text || t("未命名内容", "Untitled content")}</strong><small>{item.text}</small>{item.accountName ? <small>{item.accountName}</small> : null}</div></div></td>
            <td><PlatformLogo platform={item.platform} /></td>
            <td><span className="status-pill ready">{scheduleStatusLabel(item.status, locale)}</span></td>
            <td><a className="text-button" href="/calendar">{t("查看排程", "View schedule")}</a></td>
          </tr>)}</tbody>
        </table></div> : null}
      </section>}
      {children}
    </div>
  </>;
}

export function DashboardActivity({ token, workspaceId, ...props }: Omit<ViewProps, "data" | "loading" | "failed"> & { token: string | null; workspaceId: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => subscribeDashboardClock(setNow), []);
  const [result, setResult] = useState<{ workspaceId: string; token: string; data: DashboardOverview | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!token || !workspaceId) return;
    setResult(null);
    return startDashboardOverviewRequest(token, workspaceId, data => setResult(previous => ({ workspaceId, token, data: data ?? (previous?.workspaceId === workspaceId && previous.token === token ? previous.data : null), failed: data === null })), true);
  }, [token, workspaceId]);
  const current = result?.workspaceId === workspaceId && result.token === token ? result : null;
  return <>
    <DashboardOverviewView {...props} contentPanel={<DashboardContentPanel token={token} workspaceId={workspaceId} locale={props.locale} timezone={props.timezone} />} now={now} data={current?.data ?? null} failed={current?.failed ?? false} loading={Boolean(workspaceId) && !current} />
  </>;
}
