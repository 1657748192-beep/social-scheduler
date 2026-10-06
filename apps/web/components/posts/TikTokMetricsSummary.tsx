import React from "react";
import type { TikTokPostMetrics } from "../../lib/api";

type Translate = (zh: string, en: string) => string;

export function TikTokMetricsSummary({ result, t }: { result: TikTokPostMetrics; t: Translate }) {
  if (result.status === "ok") {
    return <div>
      <dl className="tiktok-metrics-grid">
        <div><dt>{t("播放量", "Views")}</dt><dd>{result.viewCount}</dd></div>
        <div><dt>{t("点赞数", "Likes")}</dt><dd>{result.likeCount}</dd></div>
        <div><dt>{t("评论数", "Comments")}</dt><dd>{result.commentCount}</dd></div>
        <div><dt>{t("分享数", "Shares")}</dt><dd>{result.shareCount}</dd></div>
      </dl>
      <p className="muted">{t("读取时间", "Fetched at")}: <time dateTime={result.fetchedAt}>{new Date(result.fetchedAt).toLocaleString()}</time>
        {t(" · 平台数据可能存在延迟", " · Platform counts may be delayed")}</p>
    </div>;
  }
  const messages: Record<Exclude<TikTokPostMetrics["status"], "ok">, string> = {
    permission_missing: t("尚未开通帖子数据权限（video.list）。需管理员完成 TikTok 权限审批后，再补充授权；此提示不影响原有发布功能。", "Post data permission (video.list) is not enabled. After the administrator obtains TikTok approval, authorize this additional permission. This notice does not affect existing publishing."),
    authorization_required: t("暂时无法获取有效授权，请到连接渠道检查此账号授权后重试。", "A valid authorization is unavailable. Check this account in connected channels and retry."),
    rate_limited: t("TikTok 请求过于频繁，请稍后手动刷新。", "TikTok is rate limiting requests. Refresh later."),
    temporarily_unavailable: t("TikTok 数据暂时不可用，请稍后重试。", "TikTok data is temporarily unavailable. Try again later."),
    video_unavailable: t("TikTok 未返回该视频的完整数据。视频可能非公开、已删除或暂未可查询；这不代表数据为零。", "TikTok did not return complete data for this video. It may be non-public, deleted or not yet available; this does not mean zero activity."),
    private_video: t("基础数据接口仅支持公开视频，此帖发布时设置为非公开。", "Basic metrics are available for public videos. This post was published with non-public visibility."),
    video_id_missing: t("此发布记录尚无可查询的视频 ID，不能使用发布任务 ID 读取数据。", "This publish record has no queryable video ID. A publishing task ID cannot be used to read metrics."),
    account_unavailable: t("此帖原发布账号未连接或授权不可用，请到连接渠道检查。", "The original publishing account is disconnected or unavailable. Check connected channels.")
  };
  return <p className="notice">{messages[result.status]}</p>;
}
