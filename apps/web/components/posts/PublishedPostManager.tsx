"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createReceptionPoller, instagramReadNotice, readInstagramPostActivity, type InstagramReadMetadata, type InstagramReceptionStatus } from "../../lib/instagramReception";
import {
  apiRequest,
  type ComposerPlatform,
  type InstagramComment,
  type InstagramConnection,
  type InstagramPostMetrics,
  type PublishedPost,
  type SocialAccount,
  type Workspace
} from "../../lib/api";
import { formatChinaDateTime } from "../../lib/chinaTime";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "../../lib/activeWorkspace";
import { useLanguage } from "../LanguageProvider";
import { TikTokPostMetricsPanel } from "./TikTokPostMetricsPanel";

type PublishedPostManagerProps = {
  token: string;
  workspaces: Workspace[];
};

const platformLabels: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  x: "Twitter / X"
};

function instagramErrorMessage(error: unknown, t: (chinese: string, english: string) => string) {
  const message = error instanceof Error ? error.message : "";
  if (/permission is missing|permission_missing/i.test(message)) return t("互动权限未开通，请重新授权 Instagram。", "Instagram interaction permissions are missing. Reauthorize Instagram.");
  if (/authorization is invalid|authorization_invalid/i.test(message)) return t("Instagram 授权已失效，请重新连接账号。", "Instagram authorization is invalid. Reconnect the account.");
  if (/window has expired|window.*expired|24-hour/i.test(message)) return t("回复窗口已过期，无法发送。", "The reply window has expired. This message cannot be sent.");
  if (/already attempted/i.test(message)) return t("此评论已尝试过私密回复，不能重复发送。", "A private reply was already attempted for this comment and cannot be sent again.");
  if (/rate limit/i.test(message)) return t("Instagram 请求过于频繁，请稍后重试。", "Instagram is rate limiting requests. Try again later.");
  if (message) return message;
  return t("Instagram 暂时不可用，请稍后重试。", "Instagram is temporarily unavailable. Try again later.");
}

type InstagramPostEngagementPanelProps = {
  token: string;
  workspaceId: string;
  post: PublishedPost;
  role: Workspace["role"];
};

export function InstagramPostEngagementPanel({ token, workspaceId, post, role }: InstagramPostEngagementPanelProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [metrics, setMetrics] = useState<InstagramPostMetrics | null>(null);
  const [comments, setComments] = useState<InstagramComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<{ commentId: string; mode: "public" | "private" } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [recoveryAccounts, setRecoveryAccounts] = useState<SocialAccount[] | null>(null);
  const [selectedRecoveryAccount, setSelectedRecoveryAccount] = useState("");
  const [recovering, setRecovering] = useState(false);
  const permissions = post.instagramEngagement;
  const canReply = role !== "viewer";
  const canReauthorize = role === "owner" || role === "admin";
  const postPath = `/workspaces/${encodeURIComponent(workspaceId)}/instagram/posts/${encodeURIComponent(post.id)}`;
  const [readMeta, setReadMeta] = useState<InstagramReadMetadata | null>(null);
  const currentPath = useRef(postPath);
  currentPath.current = postPath;
  useEffect(() => {
    if (!expanded || !post.socialAccount?.id) return;
    const poller = createReceptionPoller({
      readStatus: () => apiRequest<InstagramReceptionStatus>(`/workspaces/${encodeURIComponent(workspaceId)}/social-accounts/${encodeURIComponent(post.socialAccount!.id)}/instagram/reception`, { token }),
      onRevision: async () => { if (!await loadInitial()) throw new Error("Activity refresh failed"); }, intervalMs: 15000, isVisible: () => document.visibilityState === "visible"
    });
    return () => poller.stop();
  }, [expanded, postPath, token, post.socialAccount?.id]);

  async function loadInitial() {
    setLoading(true);
    setError(null);
    try {
      const metricsRequest = permissions?.readPostActivity
        ? apiRequest<InstagramPostMetrics>(`${postPath}/metrics`, { token })
        : Promise.resolve(null);
      const commentsRequest = permissions?.readComments
        ? apiRequest<InstagramConnection<InstagramComment>>(`${postPath}/comments?limit=25`, { token })
        : Promise.resolve(null);
      const result = await readInstagramPostActivity(() => metricsRequest, () => commentsRequest);
      if (currentPath.current !== postPath) return false;
      if (!result.metrics.error) setMetrics(result.metrics.data);
      if (!result.comments.error) {
        setReadMeta(result.comments.data);
        setComments(result.comments.data?.items ?? []);
        setNextCursor(result.comments.data?.nextCursor ?? null);
      }
      if (result.metrics.error || result.comments.error) setError(instagramErrorMessage(result.comments.error ?? result.metrics.error, t));
      if (!permissions?.readPostActivity || !permissions.readComments) {
        setError(t("查看评论的权限尚未开通；帖子发布仍可正常使用。", "Comment access is not enabled yet; publishing remains available."));
      }
      return !result.comments.error;
    } catch (requestError) {
      setError(instagramErrorMessage(requestError, t));
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ after: nextCursor, limit: "25" });
      const result = await apiRequest<InstagramConnection<InstagramComment>>(`${postPath}/comments?${query}`, { token });
      if (currentPath.current !== postPath) return;
      setComments((current) => [...new Map([...current, ...result.items].map(item => [item.id, item])).values()]);
      setNextCursor(result.nextCursor);
    } catch (requestError) {
      setError(instagramErrorMessage(requestError, t));
    } finally {
      setLoading(false);
    }
  }

  async function sendReply() {
    if (!replyTarget || !replyText.trim() || !canReply) return;
    if (replyTarget.mode === "private" && !window.confirm(t(
      "确认向该评论作者发送一次私密回复吗？它会发送到对方的 Instagram 收件箱，且每条评论只能尝试一次。",
      "Send one private reply to this commenter? It will go to their Instagram inbox, and only one attempt is allowed per comment."
    ))) return;
    setSending(true);
    setError(null);
    try {
      await apiRequest(`${postPath}/comments/${replyTarget.mode === "private" ? "private-replies" : "replies"}`, {
        method: "POST",
        token,
        body: { commentId: replyTarget.commentId, message: replyText.trim() }
      });
      setReplyText("");
      setReplyTarget(null);
      await loadInitial();
    } catch (requestError) {
      setError(instagramErrorMessage(requestError, t));
    } finally {
      setSending(false);
    }
  }

  async function reauthorize() {
    if (!post.socialAccount?.id || !canReauthorize) return;
    try {
      const response = await apiRequest<{ authorizationUrl: string }>(
        `/workspaces/${encodeURIComponent(workspaceId)}/social-accounts/${encodeURIComponent(post.socialAccount.id)}/instagram-engagement/oauth/start`,
        { method: "POST", token }
      );
      window.location.assign(response.authorizationUrl);
    } catch (requestError) {
      setError(instagramErrorMessage(requestError, t));
    }
  }

  async function openRecoveryPicker() {
    try {
      const accounts = await apiRequest<SocialAccount[]>(`/workspaces/${encodeURIComponent(workspaceId)}/social-accounts`, { token });
      const activeInstagramAccounts = accounts.filter((account) => account.platform === "instagram" && account.status === "active");
      setRecoveryAccounts(activeInstagramAccounts);
      setSelectedRecoveryAccount(activeInstagramAccounts[0]?.id ?? "");
      setError(activeInstagramAccounts.length ? null : t("此工作区没有可验证的已连接 Instagram 账号。请先在连接渠道中添加账号。", "No active Instagram account is available to verify. Connect an account in Connected Channels first."));
    } catch (requestError) {
      setError(instagramErrorMessage(requestError, t));
    }
  }

  async function recoverLegacyPost() {
    if (!selectedRecoveryAccount || recovering || !canReauthorize) return;
    setRecovering(true);
    setError(null);
    try {
      await apiRequest(`${postPath}/recover-account`, {
        method: "POST",
        token,
        body: { socialAccountId: selectedRecoveryAccount }
      });
      window.location.reload();
    } catch (requestError) {
      setError(instagramErrorMessage(requestError, t));
    } finally {
      setRecovering(false);
    }
  }

  return (
    <section className="instagram-engagement-panel">
      <button
        aria-expanded={expanded}
        className="button secondary instagram-engagement-toggle"
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          if (next && !metrics && !comments.length) void loadInitial();
        }}
        type="button"
      >
        {expanded ? t("收起互动", "Hide activity") : t("查看互动", "View activity")}
      </button>
      {canReauthorize && post.socialAccount?.id && permissions?.accountLinkState === "connected" ? (
        <button className="button secondary" onClick={() => void reauthorize()} type="button">
          {permissions.readComments && permissions.inbox
            ? t("更新授权（可选）", "Update authorization (optional)")
            : t("重新授权 Instagram", "Reauthorize Instagram")}
        </button>
      ) : null}
      {expanded ? (
        <div className="instagram-engagement-content">
          <div className="instagram-engagement-heading">
            <strong>{t("Instagram 帖子互动", "Instagram post activity")}</strong>
            <button className="button secondary" disabled={loading} onClick={() => void loadInitial()} type="button">
              {loading ? t("正在刷新…", "Refreshing...") : t("刷新", "Refresh")}
            </button>
          </div>
          {permissions?.webhookConfigured === false ? (
            <p className="instagram-notice">{t("Meta 回调及应用发布状态尚未验证；服务器配置不代表互动事件已接通。", "Meta callback and publication status are not verified; server configuration does not prove event delivery.")}</p>
          ) : null}
          {!permissions?.readComments || !permissions?.readPostActivity ? (
            <div className="instagram-notice">
              {permissions?.accountLinkState === "legacy_unverified" ? (
                <>
                  <span>{t("此历史帖子尚未关联 Instagram 账号。选择一个已连接账号后，我们会先验证帖子归属；不会改变原发布账号或发布设置。", "This legacy post is not linked to an Instagram account. Choose a connected account and we will verify ownership first; publishing settings will not change.")}</span>
                  {canReauthorize ? <button className="button secondary" onClick={() => void openRecoveryPicker()} type="button">{t("验证并关联账号", "Verify and link account")}</button> : null}
                  {recoveryAccounts?.length ? (
                    <div className="instagram-recovery-picker">
                      <label className="field">
                        <span>{t("Instagram 账号", "Instagram account")}</span>
                        <select onChange={(event) => setSelectedRecoveryAccount(event.target.value)} value={selectedRecoveryAccount}>
                          {recoveryAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}
                        </select>
                      </label>
                      <button className="button" disabled={!selectedRecoveryAccount || recovering} onClick={() => void recoverLegacyPost()} type="button">
                        {recovering ? t("正在验证…", "Verifying...") : t("开始验证", "Verify")}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : permissions?.accountLinkState === "reconnect" && !post.socialAccount?.id ? (
                <span>{t("原 Instagram 账号当前未连接。请先到“连接渠道”重新连接同一个 Instagram 专业账号；原有发布不受影响。", "The original Instagram account is not connected. Reconnect the same Instagram professional account in Connected Channels; publishing is unaffected.")}</span>
              ) : (
                <>
                  <span>{t("互动权限待开通或需要重新授权；这不会影响原有帖子发布。", "Interaction permissions are pending or need reauthorization; existing publishing is unaffected.")}</span>
                </>
              )}
            </div>
          ) : null}
          {metrics ? (
            <div className="instagram-metrics" aria-label={t("基础帖子数据", "Basic post metrics")}>
              <span>♥ {metrics.likeCount} {t("赞", "likes")}</span>
              <span>▢ {metrics.commentCount} {t("条评论", "comments")}</span>
            </div>
          ) : null}
          {error ? <p className="error" role="alert">{error}</p> : null}
          {instagramReadNotice(readMeta, metrics?.commentCount ?? 0, comments.length) === "visibility" ? <p className="instagram-notice">{t("Meta 返回了评论总数，但评论列表为空；请核查测试访问范围，不是没有评论。", "Meta returned a comment count but an empty list. Check test access visibility; comments do exist.")}</p> : null}
          {readMeta?.providerReadStatus === "error" ? <p className="instagram-notice">{t("Meta 读取失败，当前展示已接收的评论。", "Meta read failed; showing received comments.")}</p> : null}
          {readMeta?.lastReceivedAt ? <p className="muted">{t("最近接收时间", "Last received")}: {new Date(readMeta.lastReceivedAt).toLocaleString()}</p> : null}
          {loading && !comments.length ? <p className="muted">{t("正在读取评论…", "Loading comments...")}</p> : null}
          <div className="instagram-comments-list">
            {comments.map((comment) => (
              <article className="instagram-comment" key={comment.id}>
                <div className="instagram-comment-body">
                  <strong>{comment.username || comment.from?.username || t("Instagram 用户", "Instagram user")}</strong>
                  <p>{comment.text}</p>
                  {comment.timestamp ? <time dateTime={comment.timestamp}>{new Date(comment.timestamp).toLocaleString()}</time> : null}
                </div>
                {canReply ? (
                  <div className="instagram-comment-actions">
                    {permissions?.replyToComments ? (
                      <button className="button secondary" onClick={() => { setReplyTarget({ commentId: comment.id, mode: "public" }); setReplyText(""); }} type="button">{t("公开回复", "Public reply")}</button>
                    ) : null}
                    {permissions?.privateReply ? (
                      <button className="button secondary" onClick={() => { setReplyTarget({ commentId: comment.id, mode: "private" }); setReplyText(""); }} type="button">{t("私密回复", "Private reply")}</button>
                    ) : null}
                  </div>
                ) : <span className="muted">{t("仅可查看", "Read only")}</span>}
                {replyTarget?.commentId === comment.id ? (
                  <div className="instagram-reply-form">
                    <label className="field">
                      <span>{replyTarget.mode === "private" ? t("私密回复内容", "Private reply") : t("公开回复内容", "Public reply")}</span>
                      <textarea maxLength={2000} onChange={(event) => setReplyText(event.target.value)} value={replyText} />
                    </label>
                    {replyTarget.mode === "private" ? <p className="muted">{t("将发送到对方收件箱；每条评论只能尝试一次，且须在 7 天内发送。", "Sent to the recipient's inbox; one attempt per comment, within 7 days.")}</p> : null}
                    <button className="button" disabled={sending || !replyText.trim()} onClick={() => void sendReply()} type="button">
                      {sending ? t("正在发送…", "Sending...") : t("发送回复", "Send reply")}
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          {nextCursor ? <button className="button secondary" disabled={loading} onClick={() => void loadMore()} type="button">{t("加载更多评论", "Load more comments")}</button> : null}
          {!loading && permissions?.readComments && !comments.length && !metrics?.commentCount ? <p className="muted">{t("暂无评论。", "No comments yet.")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

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
  const workspaceRole = workspaces.find((workspace) => workspace.id === workspaceId)?.role ?? "viewer";

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
                    ) : post.providerProfilePermalink ? (
                      <a className="button secondary" href={post.providerProfilePermalink} rel="noreferrer" target="_blank">
                        {t("打开 TikTok 主页 ↗", "Open TikTok profile ↗")}
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
                {post.platform === "instagram" && post.providerPostId && post.instagramEngagement ? (
                  <InstagramPostEngagementPanel token={token} workspaceId={workspaceId} post={post} role={workspaceRole} />
                ) : null}
                {post.platform === "tiktok" ? (
                  <TikTokPostMetricsPanel key={`${workspaceId}:${post.id}:${token}`} token={token} workspaceId={workspaceId} scheduleId={post.id} />
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
