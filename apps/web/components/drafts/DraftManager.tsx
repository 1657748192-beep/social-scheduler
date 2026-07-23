"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiRequest,
  type ComposerPlatform,
  type DraftPost,
  type Workspace
} from "../../lib/api";
import { formatChinaDateTime } from "../../lib/chinaTime";

type DraftManagerProps = {
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

function getDraftTitle(draft: DraftPost) {
  const value = draft.title?.trim() || draft.baseText.trim();
  return value.length > 80 ? `${value.slice(0, 80)}…` : value || "未命名草稿";
}

function getDraftExcerpt(draft: DraftPost) {
  const value = draft.baseText.trim();
  return value.length > 180 ? `${value.slice(0, 180)}…` : value;
}

function getTimeRemaining(expiresAt: string, now: number) {
  const remainingMs = new Date(expiresAt).getTime() - now;

  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return "即将清理";
  }

  const totalMinutes = Math.ceil(remainingMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  return days ? `${days} 天 ${hours} 小时后清理` : `${hours} 小时 ${minutes} 分后清理`;
}

export function DraftManager({ token, workspaces }: DraftManagerProps) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [drafts, setDrafts] = useState<DraftPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadDrafts = useCallback(async () => {
    if (!workspaceId) {
      setDrafts([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest<DraftPost[]>(
        `/workspaces/${workspaceId}/composer/drafts`,
        { token }
      );
      setDrafts(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法读取草稿箱");
    } finally {
      setIsLoading(false);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const draftStats = useMemo(() => {
    const mediaCount = drafts.reduce(
      (count, draft) => count + draft.variants.reduce((total, variant) => total + variant.media.length, 0),
      0
    );
    const platformCount = new Set(drafts.flatMap((draft) => draft.variants.map((variant) => variant.platform))).size;

    return { mediaCount, platformCount };
  }, [drafts]);

  async function deleteDraft(draft: DraftPost) {
    if (!window.confirm(`确定删除草稿“${getDraftTitle(draft)}”吗？删除后无法恢复。`)) {
      return;
    }

    setDeletingId(draft.id);
    setError(null);

    try {
      await apiRequest<{ ok: true }>(`/workspaces/${workspaceId}/composer/drafts/${draft.id}`, {
        method: "DELETE",
        token
      });
      setDrafts((current) => current.filter((item) => item.id !== draft.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除草稿失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="draft-manager-layout">
      <section className="draft-toolbar">
        <div>
          <p className="section-kicker">草稿内容</p>
          <h2>草稿箱</h2>
          <p className="muted">草稿会保留 72 小时；到期后文案、图片和视频会自动清理。</p>
        </div>
        <div className="draft-toolbar-actions">
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
          <button className="button secondary" disabled={isLoading} onClick={loadDrafts} type="button">
            {isLoading ? "正在刷新…" : "刷新列表"}
          </button>
          <Link className="button" href={`/composer?workspaceId=${encodeURIComponent(workspaceId)}`}>
            新建内容
          </Link>
        </div>
      </section>

      <section className="draft-stats" aria-label="草稿统计">
        <article>
          <strong>{drafts.length}</strong>
          <span>当前草稿</span>
        </article>
        <article>
          <strong>{draftStats.platformCount}</strong>
          <span>涉及平台</span>
        </article>
        <article>
          <strong>{draftStats.mediaCount}</strong>
          <span>关联素材</span>
        </article>
      </section>

      {error ? <p className="error">{error}</p> : null}
      {isLoading && !drafts.length ? <p className="muted">正在读取草稿…</p> : null}

      {!isLoading && !drafts.length ? (
        <section className="draft-empty">
          <h2>草稿箱为空</h2>
          <p>在内容编辑页选择“保存草稿”后，内容会显示在这里。</p>
          <Link className="button" href={`/composer?workspaceId=${encodeURIComponent(workspaceId)}`}>
            去创建草稿
          </Link>
        </section>
      ) : null}

      <div className="draft-list">
        {drafts.map((draft) => {
          const firstAsset = draft.variants.flatMap((variant) => variant.media.map((item) => item.mediaAsset))[0];
          const thumbnailUrl = firstAsset?.thumbnailUrl ?? (
            firstAsset?.mimeType.startsWith("image/") && firstAsset.originalAvailable !== false
              ? firstAsset.fileUrl
              : null
          );
          const accounts = Array.from(
            new Set(
              draft.variants.map((variant) => variant.socialAccount?.displayName || platformLabels[variant.platform])
            )
          );
          const platforms = Array.from(new Set(draft.variants.map((variant) => variant.platform)));

          return (
            <article className="draft-card" key={draft.id}>
              <div className="draft-thumb" aria-hidden="true">
                {thumbnailUrl ? <img alt="" src={thumbnailUrl} /> : <span>{firstAsset ? "素材" : "无素材"}</span>}
                {firstAsset?.mimeType.startsWith("video/") ? <small>视频</small> : null}
              </div>
              <div className="draft-copy">
                <div className="draft-heading">
                  <div>
                    <p>{platforms.map((platform) => platformLabels[platform]).join(" · ") || "未选择平台"}</p>
                    <h2>{getDraftTitle(draft)}</h2>
                  </div>
                  <span className="draft-expiry">{getTimeRemaining(draft.expiresAt, now)}</span>
                </div>
                <p className="draft-excerpt">{getDraftExcerpt(draft) || "未填写文案"}</p>
                <dl className="draft-meta">
                  <div>
                    <dt>保存时间</dt>
                    <dd>{formatChinaDateTime(new Date(draft.updatedAt))}</dd>
                  </div>
                  <div>
                    <dt>发布账号</dt>
                    <dd>{accounts.join("、") || "未选择账号"}</dd>
                  </div>
                  <div>
                    <dt>素材</dt>
                    <dd>{draft.variants.reduce((count, variant) => count + variant.media.length, 0)} 个</dd>
                  </div>
                </dl>
                <div className="draft-actions">
                  <Link
                    className="button"
                    href={`/composer?workspaceId=${encodeURIComponent(workspaceId)}&draftPostId=${encodeURIComponent(draft.id)}`}
                  >
                    继续编辑
                  </Link>
                  <button
                    className="button secondary draft-delete-button"
                    disabled={deletingId === draft.id}
                    onClick={() => void deleteDraft(draft)}
                    type="button"
                  >
                    {deletingId === draft.id ? "正在删除…" : "删除草稿"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
