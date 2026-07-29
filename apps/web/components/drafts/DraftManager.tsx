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
import { useLanguage } from "../LanguageProvider";

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
  const { t } = useLanguage();
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
      setError(requestError instanceof Error ? requestError.message : t("无法读取草稿箱", "Unable to load drafts"));
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
    if (!window.confirm(t(`确定删除草稿“${getDraftTitle(draft)}”吗？删除后无法恢复。`, `Delete draft “${getDraftTitle(draft)}”? This cannot be undone.`))) {
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
      setError(requestError instanceof Error ? requestError.message : t("删除草稿失败", "Unable to delete draft"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="draft-manager-layout">
      <section className="draft-toolbar">
        <div>
          <p className="section-kicker">{t("草稿内容", "Draft content")}</p>
          <h2>{t("草稿箱", "Drafts")}</h2>
          <p className="muted">{t("草稿会保留 72 小时；到期后文案、图片和视频会自动清理。", "Drafts are kept for 72 hours. Copy, images, and videos are cleared automatically when they expire.")}</p>
        </div>
        <div className="draft-toolbar-actions">
          <label className="field">
            <span>{t("工作区", "Workspace")}</span>
            <select onChange={(event) => setWorkspaceId(event.target.value)} value={workspaceId}>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary" disabled={isLoading} onClick={loadDrafts} type="button">
            {isLoading ? t("正在刷新…", "Refreshing...") : t("刷新列表", "Refresh")}
          </button>
          <Link className="button" href={`/composer?workspaceId=${encodeURIComponent(workspaceId)}`}>
            {t("新建内容", "New content")}
          </Link>
        </div>
      </section>

      <section className="draft-stats" aria-label={t("草稿统计", "Draft statistics")}>
        <article>
          <strong>{drafts.length}</strong>
          <span>{t("当前草稿", "Current drafts")}</span>
        </article>
        <article>
          <strong>{draftStats.platformCount}</strong>
          <span>{t("涉及平台", "Platforms")}</span>
        </article>
        <article>
          <strong>{draftStats.mediaCount}</strong>
          <span>{t("关联素材", "Media items")}</span>
        </article>
      </section>

      {error ? <p className="error">{error}</p> : null}
      {isLoading && !drafts.length ? <p className="muted">{t("正在读取草稿…", "Loading drafts...")}</p> : null}

      {!isLoading && !drafts.length ? (
        <section className="draft-empty">
          <h2>{t("草稿箱为空", "No drafts yet")}</h2>
          <p>{t("在内容编辑页选择“保存草稿”后，内容会显示在这里。", "Choose Save draft in the content editor and it will appear here.")}</p>
          <Link className="button" href={`/composer?workspaceId=${encodeURIComponent(workspaceId)}`}>
            {t("去创建草稿", "Create a draft")}
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
                {thumbnailUrl ? <img alt="" src={thumbnailUrl} /> : <span>{firstAsset ? t("素材", "Media") : t("无素材", "No media")}</span>}
                {firstAsset?.mimeType.startsWith("video/") ? <small>{t("视频", "Video")}</small> : null}
              </div>
              <div className="draft-copy">
                <div className="draft-heading">
                  <div>
                    <p>{platforms.map((platform) => platformLabels[platform]).join(" · ") || t("未选择平台", "No platform selected")}</p>
                    <h2>{getDraftTitle(draft)}</h2>
                  </div>
                  <span className="draft-expiry">{getTimeRemaining(draft.expiresAt, now)}</span>
                </div>
                <p className="draft-excerpt">{getDraftExcerpt(draft) || t("未填写文案", "No copy entered")}</p>
                <dl className="draft-meta">
                  <div>
                    <dt>{t("保存时间", "Saved")}</dt>
                    <dd>{formatChinaDateTime(new Date(draft.updatedAt))}</dd>
                  </div>
                  <div>
                    <dt>{t("发布账号", "Publishing accounts")}</dt>
                    <dd title={accounts.join("、") || t("未选择账号", "No accounts selected")}>
                      {accounts.join("、") || t("未选择账号", "No accounts selected")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("素材", "Media")}</dt>
                    <dd>{t(`${draft.variants.reduce((count, variant) => count + variant.media.length, 0)} 个`, `${draft.variants.reduce((count, variant) => count + variant.media.length, 0)} items`)}</dd>
                  </div>
                </dl>
                <div className="draft-actions">
                  <Link
                    className="button"
                    href={`/composer?workspaceId=${encodeURIComponent(workspaceId)}&draftPostId=${encodeURIComponent(draft.id)}`}
                  >
                    {t("继续编辑", "Continue editing")}
                  </Link>
                  <button
                    className="button secondary draft-delete-button"
                    disabled={deletingId === draft.id}
                    onClick={() => void deleteDraft(draft)}
                    type="button"
                  >
                    {deletingId === draft.id ? t("正在删除…", "Deleting...") : t("删除草稿", "Delete draft")}
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
