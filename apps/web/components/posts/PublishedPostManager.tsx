"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiRequest,
  type ComposerPlatform,
  type PublishedPost,
  type Workspace
} from "../../lib/api";
import { formatChinaDateTime } from "../../lib/chinaTime";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "../../lib/activeWorkspace";
import { useLanguage } from "../LanguageProvider";

type PublishedPostManagerProps = {
  token: string;
  workspaces: Workspace[];
};

const platformLabels: Record<ComposerPlatform, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  x: "Twitter / X"
};

function getPostLabel(post: PublishedPost) {
  const value = post.title?.trim() || post.text.trim() || post.baseText.trim();
  return value.length > 74 ? `${value.slice(0, 74)}…` : value || "未命名帖子";
}

function getPostExcerpt(post: PublishedPost) {
  const value = post.text.trim() || post.baseText.trim();
  return value.length > 180 ? `${value.slice(0, 180)}…` : value;
}

function getMediaReuseStatus(post: PublishedPost, now: number, locale: "zh-CN" | "en") {
  const availableCount = post.media.filter(({ mediaAsset }) => mediaAsset.originalAvailable !== false).length;

  if (!post.media.length) {
    return {
      active: false,
      availableCount,
      text: locale === "en" ? "No media to reuse" : "暂无可复用素材"
    };
  }

  if (!availableCount) {
    return {
      active: false,
      availableCount,
      text: locale === "en" ? "Original media cleared" : "原素材已清理"
    };
  }

  if (!post.mediaReuseExpiresAt) {
    return {
      active: false,
      availableCount,
      text: locale === "en" ? "Media is being cleared" : "素材清理中"
    };
  }

  const remainingMs = new Date(post.mediaReuseExpiresAt).getTime() - now;

  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return {
      active: false,
      availableCount,
      text: locale === "en" ? "Media is being cleared" : "素材清理中"
    };
  }

  const totalMinutes = Math.ceil(remainingMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const remaining = locale === "en"
    ? days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`
    : days ? `${days} 天 ${hours} 小时` : `${hours} 小时 ${minutes} 分`;

  return {
    active: true,
    availableCount,
    text: locale === "en" ? `Reusable for ${remaining}` : `还可复用 ${remaining}`
  };
}

export function PublishedPostManager({ token, workspaces }: PublishedPostManagerProps) {
  const { t, locale } = useLanguage();
  const [workspaceId, setWorkspaceId] = useState("");
  const [platform, setPlatform] = useState<ComposerPlatform | "all">("all");
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const nextWorkspaceId = getActiveWorkspaceId(workspaces, workspaceId);
    setWorkspaceId(nextWorkspaceId);
  }, [workspaces]);

  function selectWorkspace(nextWorkspaceId: string) {
    setActiveWorkspaceId(nextWorkspaceId);
    setWorkspaceId(nextWorkspaceId);
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadPosts = useCallback(async () => {
    if (!workspaceId) {
      setPosts([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest<PublishedPost[]>(
        `/workspaces/${workspaceId}/published-posts`,
        { token }
      );
      setPosts(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("无法读取已发布帖子", "Unable to load published posts"));
    } finally {
      setIsLoading(false);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const filteredPosts = useMemo(
    () => (platform === "all" ? posts : posts.filter((post) => post.platform === platform)),
    [platform, posts]
  );
  const publishedPlatformCount = useMemo(
    () => new Set(posts.map((post) => post.platform)).size,
    [posts]
  );

  return (
    <div className="post-manager-layout">
      <section className="published-post-toolbar">
        <div>
          <p className="section-kicker">{t("发布记录", "Publishing records")}</p>
          <h2>{t("已发布帖子", "Published posts")}</h2>
          <p className="muted">{t("按账号保存每次发布的文案、素材、时间和平台链接，可复制后微调并再次发布。", "Every account's copy, media, time, and platform link are saved. Copy one to adjust and publish again.")}</p>
        </div>
        <div className="published-post-actions">
          <label className="field">
            <span>{t("工作区", "Workspace")}</span>
            <select onChange={(event) => selectWorkspace(event.target.value)} value={workspaceId}>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("平台", "Platform")}</span>
            <select onChange={(event) => setPlatform(event.target.value as ComposerPlatform | "all")} value={platform}>
              <option value="all">{t("全部平台", "All platforms")}</option>
              {Object.entries(platformLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary published-refresh-button" disabled={isLoading} onClick={loadPosts} type="button">
            {isLoading ? t("正在刷新…", "Refreshing...") : t("刷新列表", "Refresh")}
          </button>
        </div>
      </section>

      <section className="published-post-stats" aria-label={t("发布统计", "Publishing statistics")}>
        <article>
          <strong>{posts.length}</strong>
          <span>{t("已发布账号帖子", "Published account posts")}</span>
        </article>
        <article>
          <strong>{publishedPlatformCount}</strong>
          <span>{t("已发布平台", "Published platforms")}</span>
        </article>
        <article>
          <strong>{filteredPosts.length}</strong>
          <span>{t("当前筛选结果", "Current results")}</span>
        </article>
      </section>

      {error ? <p className="error">{error}</p> : null}

      {isLoading && !posts.length ? <p className="muted">{t("正在读取已发布帖子…", "Loading published posts...")}</p> : null}

      {!isLoading && !filteredPosts.length ? (
        <section className="published-post-empty">
          <h2>{t("还没有已发布的帖子", "No published posts yet")}</h2>
          <p>{t("完成一次立即发布或定时发布后，记录会自动显示在这里。", "Records appear here after publishing now or scheduling a post.")}</p>
          <Link className="button" href="/composer">
            {t("新建内容", "New content")}
          </Link>
        </section>
      ) : null}

      <div className="published-post-list">
        {filteredPosts.map((post) => {
          const thumbnail = post.media[0]?.mediaAsset;
          const thumbnailUrl = thumbnail?.thumbnailUrl ?? (
            thumbnail?.originalAvailable !== false ? thumbnail?.fileUrl : null
          );
          const composerUrl = `/composer?workspaceId=${encodeURIComponent(workspaceId)}&copyPostId=${encodeURIComponent(post.postId)}`;
          const mediaReuse = getMediaReuseStatus(post, now, locale);

          return (
            <article className="published-post-card" key={post.id}>
              <div className="published-post-thumb" aria-hidden="true">
                {thumbnail && thumbnailUrl ? (
                  <>
                    <img alt="" src={thumbnailUrl} />
                    {thumbnail.mimeType.startsWith("video/") ? <span>{t("视频", "Video")}</span> : null}
                    {thumbnail.originalAvailable === false ? (
                      <span className="published-post-thumb-cleaned">{t("原素材已清理", "Original media cleared")}</span>
                    ) : null}
                  </>
                ) : thumbnail ? (
                  <span className="published-post-placeholder">{t("原素材已清理", "Original media cleared")}</span>
                ) : (
                  <span className="published-post-placeholder">{t("无素材", "No media")}</span>
                )}
              </div>

              <div className="published-post-copy">
                <div className="published-post-heading">
                  <div>
                    <span className={`published-platform-tag ${post.platform}`}>{platformLabels[post.platform]}</span>
                    <h2>{getPostLabel(post)}</h2>
                  </div>
                  <span className="published-status">{t("已发布", "Published")}</span>
                </div>
                <p>{getPostExcerpt(post)}</p>
                <dl className="published-post-meta">
                  <div>
                    <dt>{t("发布账号", "Publishing account")}</dt>
                    <dd>{post.socialAccount?.displayName || t("原账号已移除", "Original account removed")}</dd>
                  </div>
                  <div>
                    <dt>{t("发布时间", "Published at")}</dt>
                    <dd>{formatChinaDateTime(new Date(post.publishedAt))}</dd>
                  </div>
                  <div>
                    <dt>{t("原计划时间", "Original scheduled time")}</dt>
                    <dd>{formatChinaDateTime(new Date(post.scheduledAt))}</dd>
                  </div>
                  <div>
                    <dt>{t("素材复用", "Media reuse")}</dt>
                    <dd className={mediaReuse.active ? "published-media-reuse active" : "published-media-reuse"}>
                      {post.media.length
                        ? t(`${mediaReuse.availableCount}/${post.media.length} 个 · ${mediaReuse.text}`, `${mediaReuse.availableCount}/${post.media.length} items · ${mediaReuse.text}`)
                        : mediaReuse.text}
                    </dd>
                  </div>
                </dl>
                <div className="published-post-footer">
                  <span>
                    {mediaReuse.active
                      ? t("请在倒计时结束前复制，可带入当前素材后再次编辑。", "Copy before the countdown ends to carry current media into the editor.")
                      : t("可复制原文案再次编辑；如需图片或视频，请重新上传素材。", "Copy the original text to edit again. Upload media again if you need images or video.")}
                  </span>
                  <div className="published-post-footer-actions">
                    {post.providerPermalink ? (
                      <a className="button secondary" href={post.providerPermalink} rel="noreferrer" target="_blank">
                        {t("打开已发布内容 ↗", "Open published post ↗")}
                      </a>
                    ) : (
                      <span aria-disabled="true" className="button secondary published-post-link-unavailable">
                        {t("发布链接不可用", "Publishing link unavailable")}
                      </span>
                    )}
                    <Link className="button" href={composerUrl}>
                      {mediaReuse.active ? t("复制到发布页", "Copy to composer") : t("复制文案到发布页", "Copy text to composer")}
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
