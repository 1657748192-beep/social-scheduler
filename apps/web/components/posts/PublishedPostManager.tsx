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

export function PublishedPostManager({ token, workspaces }: PublishedPostManagerProps) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [platform, setPlatform] = useState<ComposerPlatform | "all">("all");
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(requestError instanceof Error ? requestError.message : "无法读取已发布帖子");
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
          <p className="section-kicker">发布记录</p>
          <h2>已发布帖子</h2>
          <p className="muted">按账号保存每次发布的文案、素材、时间和平台链接，可复制后微调并再次发布。</p>
        </div>
        <div className="published-post-actions">
          <label className="field">
            <span>工作区</span>
            <select onChange={(event) => setWorkspaceId(event.target.value)} value={workspaceId}>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>平台</span>
            <select onChange={(event) => setPlatform(event.target.value as ComposerPlatform | "all")} value={platform}>
              <option value="all">全部平台</option>
              {Object.entries(platformLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary published-refresh-button" disabled={isLoading} onClick={loadPosts} type="button">
            {isLoading ? "正在刷新…" : "刷新列表"}
          </button>
        </div>
      </section>

      <section className="published-post-stats" aria-label="发布统计">
        <article>
          <strong>{posts.length}</strong>
          <span>已发布账号帖子</span>
        </article>
        <article>
          <strong>{publishedPlatformCount}</strong>
          <span>已发布平台</span>
        </article>
        <article>
          <strong>{filteredPosts.length}</strong>
          <span>当前筛选结果</span>
        </article>
      </section>

      {error ? <p className="error">{error}</p> : null}

      {isLoading && !posts.length ? <p className="muted">正在读取已发布帖子…</p> : null}

      {!isLoading && !filteredPosts.length ? (
        <section className="published-post-empty">
          <h2>还没有已发布的帖子</h2>
          <p>完成一次立即发布或定时发布后，记录会自动显示在这里。</p>
          <Link className="button" href="/composer">
            新建内容
          </Link>
        </section>
      ) : null}

      <div className="published-post-list">
        {filteredPosts.map((post) => {
          const thumbnail = post.media[0]?.mediaAsset;
          const composerUrl = `/composer?workspaceId=${encodeURIComponent(workspaceId)}&copyPostId=${encodeURIComponent(post.postId)}`;

          return (
            <article className="published-post-card" key={post.id}>
              <div className="published-post-thumb" aria-hidden="true">
                {thumbnail ? (
                  thumbnail.mimeType.startsWith("video/") ? (
                    <>
                      <video muted preload="metadata" src={thumbnail.fileUrl} />
                      <span>视频</span>
                    </>
                  ) : (
                    <img alt="" src={thumbnail.fileUrl} />
                  )
                ) : (
                  <span className="published-post-placeholder">无素材</span>
                )}
              </div>

              <div className="published-post-copy">
                <div className="published-post-heading">
                  <div>
                    <span className={`published-platform-tag ${post.platform}`}>{platformLabels[post.platform]}</span>
                    <h2>{getPostLabel(post)}</h2>
                  </div>
                  <span className="published-status">已发布</span>
                </div>
                <p>{getPostExcerpt(post)}</p>
                <dl className="published-post-meta">
                  <div>
                    <dt>发布账号</dt>
                    <dd>{post.socialAccount?.displayName || "原账号已移除"}</dd>
                  </div>
                  <div>
                    <dt>发布时间</dt>
                    <dd>{formatChinaDateTime(new Date(post.publishedAt))}</dd>
                  </div>
                  <div>
                    <dt>原计划时间</dt>
                    <dd>{formatChinaDateTime(new Date(post.scheduledAt))}</dd>
                  </div>
                  <div>
                    <dt>素材</dt>
                    <dd>{post.media.length} 个</dd>
                  </div>
                </dl>
                <div className="published-post-footer">
                  <span>发布记录与原始素材可复制后再次编辑。</span>
                  <div className="published-post-footer-actions">
                    {post.providerPermalink ? (
                      <a className="button secondary" href={post.providerPermalink} rel="noreferrer" target="_blank">
                        打开已发布内容 ↗
                      </a>
                    ) : (
                      <span aria-disabled="true" className="button secondary published-post-link-unavailable">
                        发布链接不可用
                      </span>
                    )}
                    <Link className="button" href={composerUrl}>
                      复制到发布页
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
