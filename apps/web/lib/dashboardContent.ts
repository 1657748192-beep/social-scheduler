import type { CalendarSchedule, DraftPost, MediaAsset } from "./api";

export type DashboardContentTab = "upcoming" | "calendar" | "drafts" | "published" | "queue";
export type ContentRow = {
  id: string; postId: string; time: string; title: string; text: string; assetIds: string[];
  thumbnailUrl: string | null; platform: string; accountName: string; status: string; href: string;
};
export type ContentGroup = ContentRow & { records: ContentRow[] };

function mediaInfo(media: Array<{ sortOrder: number; mediaAsset: MediaAsset }>) {
  const assets = [...media].sort((a, b) => a.sortOrder - b.sortOrder).map(link => link.mediaAsset);
  const first = assets[0];
  return { assetIds: assets.map(asset => asset.id), thumbnailUrl: first?.thumbnailUrl || (first?.mimeType.startsWith("image/") && !first.originalDeletedAt ? first.fileUrl : null) || null };
}

export function scheduleContentRows(schedules: CalendarSchedule[]): ContentRow[] {
  return schedules.map(item => ({
    id: item.id, postId: item.postVariant.post.id, time: item.scheduledAt,
    title: item.postVariant.post.title || "", text: item.postVariant.text,
    ...mediaInfo(item.postVariant.media), platform: item.postVariant.platform,
    accountName: item.postVariant.socialAccount?.displayName || "", status: item.status,
    href: item.status === "published" ? "/posts" : "/calendar"
  }));
}

export function draftContentRows(drafts: DraftPost[]): ContentRow[] {
  return drafts.filter(post => new Date(post.expiresAt).getTime() > Date.now()).flatMap<ContentRow>(post => post.variants.length ? post.variants.map(variant => ({
    id: variant.id, postId: post.id, time: post.updatedAt, title: post.title || "", text: variant.text,
    ...mediaInfo(variant.media), platform: variant.platform, accountName: variant.socialAccount?.displayName || "", status: "draft", href: "/drafts"
  })) : [{ id: post.id, postId: post.id, time: post.updatedAt, title: post.title || "", text: post.baseText, assetIds: [], thumbnailUrl: null, platform: "", accountName: "", status: "draft", href: "/drafts" }]);
}

export function groupContentRows(rows: ContentRow[]): ContentGroup[] {
  const groups = new Map<string, ContentGroup>();
  for (const row of rows) {
    // Compare the complete ordered asset list, never just its thumbnail.
    // With no assets, only variants of the same source post may merge.
    const key = JSON.stringify([row.assetIds.length ? row.assetIds : [row.postId], row.text, new Date(row.time).getTime()]);
    const group = groups.get(key);
    if (group) group.records.push(row);
    else groups.set(key, { ...row, records: [row] });
  }
  return [...groups.values()];
}

export function contentRowsForTab(schedules: CalendarSchedule[], drafts: DraftPost[], tab: DashboardContentTab) {
  const rows = tab === "drafts" ? draftContentRows(drafts) : scheduleContentRows(schedules).filter(row =>
    tab === "published" ? row.status === "published" : tab === "calendar" ? row.status !== "canceled" : tab === "queue" ? ["scheduled", "locked", "failed"].includes(row.status) : ["scheduled", "locked"].includes(row.status));
  rows.sort((a, b) => (new Date(a.time).getTime() - new Date(b.time).getTime()) * (["published", "drafts"].includes(tab) ? -1 : 1) || a.id.localeCompare(b.id));
  return groupContentRows(rows);
}

export function calendarDate(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
