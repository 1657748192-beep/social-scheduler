"use client";
import React, { useEffect, useState } from "react";
import { type CalendarSchedule, type DraftPost } from "../../lib/api";
import { calendarDate, contentRowsForTab, type ContentGroup, type DashboardContentTab } from "../../lib/dashboardContent";
import { startDashboardResourceRequest } from "../../lib/dashboardOverviewRequest";
import { platformLabel, scheduleStatusLabel } from "../../lib/labels";

const tabs = [
  ["upcoming", "即将发布", "Upcoming"], ["calendar", "日历视图", "Calendar"], ["drafts", "草稿", "Drafts"],
  ["published", "已发布", "Published"], ["queue", "发布队列", "Publishing queue"]
] as const;

type Props = {
  schedules: CalendarSchedule[]; drafts: DraftPost[]; activeTab: DashboardContentTab;
  locale: "zh-CN" | "en"; timezone: string; loading: boolean; failed: boolean; month: string;
  onTabChange: (tab: DashboardContentTab) => void; onMonthChange: (month: string) => void;
};

function Platforms({ group }: { group: ContentGroup }) {
  const platforms = [...new Set(group.records.map(record => record.platform).filter(Boolean))];
  return <div className="dashboard-platforms">{platforms.map(platform => <span key={platform} className={`dashboard-platform-badge ${platform}`} title={platformLabel(platform)}>{platformLabel(platform)}</span>)}</div>;
}

export function DashboardContentView({ schedules, drafts, activeTab, locale, timezone, loading, failed, month, onTabChange, onMonthChange }: Props) {
  const t = (zh: string, en: string) => locale === "en" ? en : zh;
  let zone = timezone;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); } catch { zone = "Asia/Shanghai"; }
  const groups = contentRowsForTab(schedules, drafts, activeTab);
  const href = activeTab === "drafts" ? "/drafts" : activeTab === "published" ? "/posts" : "/calendar";
  const empty = activeTab === "drafts" ? t("暂无草稿", "No drafts") : activeTab === "published" ? t("暂无已发布内容", "No published content") : activeTab === "queue" ? t("暂无发布队列记录", "No queued publications") : t("暂无待发布内容", "No pending publications");
  const monthDate = new Date(`${month}-01T00:00:00Z`);
  const monthLength = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  const offset = (monthDate.getUTCDay() + 6) % 7;
  const moveMonth = (delta: number) => { const next = new Date(monthDate); next.setUTCMonth(next.getUTCMonth() + delta); onMonthChange(next.toISOString().slice(0, 7)); };
  return <section className="panel dashboard-upcoming dashboard-content-panel">
    <div className="dashboard-content-toolbar">
      <div className="dashboard-content-tabs" role="tablist" aria-label={t("内容视图", "Content views")}>
        {tabs.map(([id, zh, en], index) => <button key={id} type="button" role="tab" id={`content-tab-${id}`} tabIndex={activeTab === id ? 0 : -1} aria-selected={activeTab === id} aria-controls="dashboard-content-tabpanel" onClick={() => onTabChange(id)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
          if (next !== null) { event.preventDefault(); onTabChange(tabs[next][0]); document.getElementById(`content-tab-${tabs[next][0]}`)?.focus(); }
        }}>{t(zh, en)}</button>)}
      </div>
      <a className="text-button dashboard-view-all" href={href}>{t("查看全部 →", "View all →")}</a>
    </div>
    <div role="tabpanel" id="dashboard-content-tabpanel" aria-labelledby={`content-tab-${activeTab}`}>
      <p className="muted dashboard-content-scope">{activeTab === "calendar" ? t("当前工作区 · 月历（按工作区时区）", "Current workspace · Calendar in workspace timezone") : activeTab === "drafts" ? t("我的有效草稿 · 最近 5 组内容", "My unexpired drafts · Latest 5 content groups") : activeTab === "published" ? t("当前工作区 · 最近 5 组已发布内容（按原排程时间合并）", "Current workspace · Latest 5 published groups, grouped by original schedule time") : t("当前工作区 · 前 5 组内容，相同素材、文案和发布时间合并展示", "Current workspace · First 5 groups, matching assets, caption and publication time grouped")}</p>
      {failed ? <p className="error" role="alert">{t("暂时无法更新内容，将自动重试。", "Could not update content. Retrying automatically.")}</p> : null}
      {loading ? <p className="muted" role="status">{t("正在读取内容…", "Loading content…")}</p> : activeTab === "calendar" ? <>
        <div className="dashboard-calendar-toolbar"><button type="button" className="text-button" aria-label={t("上个月", "Previous month")} onClick={() => moveMonth(-1)}>‹</button><strong>{month}</strong><button type="button" className="text-button" aria-label={t("下个月", "Next month")} onClick={() => moveMonth(1)}>›</button></div>
        <div className="dashboard-mini-calendar">{(locale === "en" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["一", "二", "三", "四", "五", "六", "日"]).map(day => <strong className="dashboard-calendar-weekday" key={day}>{day}</strong>)}
          {Array.from({ length: offset }, (_, i) => <div className="dashboard-calendar-blank" key={`blank-${i}`} />)}
          {Array.from({ length: monthLength }, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, "0")}`; const entries = groups.filter(group => calendarDate(group.time, zone) === date); return <div className="dashboard-calendar-day" data-calendar-date={date} key={date}><span>{i + 1}</span>{entries.slice(0, 2).map(group => <a key={group.id} href={group.href} title={group.text}>{group.title || group.text || t("未命名内容", "Untitled content")}<small>{[...new Set(group.records.map(row => row.platform))].map(platformLabel).join(" · ")}</small></a>)}{entries.length > 2 ? <a href="/calendar">+{entries.length - 2}</a> : null}</div>; })}
        </div>
      </> : !groups.length ? (!failed ? <p className="muted">{empty}</p> : null) : <div className="dashboard-upcoming-scroll"><table className="dashboard-upcoming-table">
        <thead><tr>{[activeTab === "drafts" ? t("保存时间", "Saved at") : activeTab === "published" ? t("原排程时间", "Original schedule time") : t("日期/时间", "Date / time"), t("内容", "Content"), t("平台", "Platform"), t("状态", "Status"), t("操作", "Actions")].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{groups.slice(0, 5).map(group => { const statuses = [...new Set(group.records.map(record => record.status))]; return <tr key={group.id} data-content-group={group.id}>
          <td><time dateTime={group.time}>{new Date(group.time).toLocaleString(locale, { timeZone: zone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</time></td>
          <td><div className="dashboard-upcoming-content">{group.thumbnailUrl ? <img src={group.thumbnailUrl} alt="" loading="lazy" /> : <span className="dashboard-thumbnail-placeholder" aria-hidden="true">▤</span>}<div><strong>{group.title || group.text || t("未命名内容", "Untitled content")}</strong><small>{group.text}</small><small>{[...new Set(group.records.map(record => record.accountName).filter(Boolean))].join(" · ")}</small></div></div></td>
          <td><Platforms group={group} /></td>
          <td><div className="dashboard-content-statuses">{statuses.length === 1 ? <span className={`status-pill ${group.status === "failed" ? "failed" : "ready"}`}>{group.status === "draft" ? t("草稿", "Draft") : scheduleStatusLabel(group.status, locale)}</span> : group.records.map(record => <span className={`status-pill ${record.status === "failed" ? "failed" : "ready"}`} key={record.id}>{platformLabel(record.platform)} · {scheduleStatusLabel(record.status, locale)}</span>)}</div></td>
          <td><a className="text-button" href={group.href}>{activeTab === "drafts" ? t("继续编辑", "Edit draft") : activeTab === "published" ? t("查看帖子", "View post") : t("查看排程", "View schedule")}</a></td>
        </tr>; })}</tbody>
      </table></div>}
    </div>
  </section>;
}

export function DashboardContentPanel({ token, workspaceId, locale, timezone }: { token: string | null; workspaceId: string; locale: "zh-CN" | "en"; timezone: string }) {
  const [activeTab, setActiveTab] = useState<DashboardContentTab>("upcoming");
  const [month, setMonth] = useState(() => calendarDate(new Date().toISOString(), "Asia/Shanghai").slice(0, 7));
  useEffect(() => {
    let zone = timezone;
    try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); } catch { zone = "Asia/Shanghai"; }
    setMonth(calendarDate(new Date().toISOString(), zone).slice(0, 7));
  }, [workspaceId, timezone]);
  const [result, setResult] = useState<{ key: string; data: CalendarSchedule[] | DraftPost[] | null; failed: boolean } | null>(null);
  const resource = activeTab === "drafts" ? "composer/drafts" : "schedules";
  const key = JSON.stringify([token, workspaceId, resource]);
  useEffect(() => {
    if (!token || !workspaceId) return;
    return startDashboardResourceRequest<CalendarSchedule[] | DraftPost[]>(token, `/workspaces/${encodeURIComponent(workspaceId)}/${resource}`, data => setResult(previous => ({ key, data: data ?? (previous?.key === key ? previous.data : null), failed: data === null })), true);
  }, [token, workspaceId, resource, key]);
  const current = result?.key === key ? result : null;
  return <DashboardContentView schedules={resource === "schedules" ? (current?.data as CalendarSchedule[] ?? []) : []} drafts={resource !== "schedules" ? (current?.data as DraftPost[] ?? []) : []} activeTab={activeTab} onTabChange={setActiveTab} month={month} onMonthChange={setMonth} locale={locale} timezone={timezone} failed={current?.failed ?? false} loading={Boolean(workspaceId && token) && !current} />;
}
