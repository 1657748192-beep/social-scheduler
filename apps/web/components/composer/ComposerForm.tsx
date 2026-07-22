"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  apiRequest,
  type ComposerPlatform,
  type ComposerPost,
  type ComposerPostDetail,
  type MediaAsset,
  type SocialAccount,
  type Workspace
} from "../../lib/api";
import { chinaLocalInputToISOString } from "../../lib/chinaTime";
import { AccountTargetSelector } from "./AccountTargetSelector";
import { appendWebsiteToText, isValidWebsite } from "./contentUtils";
import { MediaUploader } from "./MediaUploader";
import { PlatformEditor } from "./PlatformEditor";
import { platformLimits } from "./platformConfig";
import { PlatformTabs } from "./PlatformTabs";
import { PostPreview } from "./PostPreview";
import { SchedulePicker } from "./SchedulePicker";
import { TextInsertToolbar } from "./TextInsertToolbar";

type ComposerFormProps = {
  token: string;
  workspaces: Workspace[];
  copyPostId?: string | null;
  initialWorkspaceId?: string | null;
};

const allComposerPlatforms: ComposerPlatform[] = [
  "instagram",
  "linkedin",
  "facebook",
  "youtube",
  "tiktok",
  "pinterest",
  "x"
];
const realPublishingPlatforms = new Set<ComposerPlatform>(["instagram", "facebook", "youtube"]);

type MediaSource = "shared" | "custom";

function createVariantTextMap(value = "") {
  return Object.fromEntries(
    allComposerPlatforms.map((platform) => [platform, value])
  ) as Record<ComposerPlatform, string>;
}

function createPlatformMediaMap(): Record<ComposerPlatform, MediaAsset[]> {
  return allComposerPlatforms.reduce<Record<ComposerPlatform, MediaAsset[]>>((media, platform) => {
    media[platform] = [];
    return media;
  }, {} as Record<ComposerPlatform, MediaAsset[]>);
}

function createPlatformMediaSourceMap(): Record<ComposerPlatform, MediaSource> {
  return allComposerPlatforms.reduce<Record<ComposerPlatform, MediaSource>>((sources, platform) => {
    sources[platform] = "shared";
    return sources;
  }, {} as Record<ComposerPlatform, MediaSource>);
}

export function ComposerForm({ token, workspaces, copyPostId, initialWorkspaceId }: ComposerFormProps) {
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId || workspaces[0]?.id || "");
  const [title, setTitle] = useState("");
  const [baseText, setBaseText] = useState("");
  const [baseWebsite, setBaseWebsite] = useState("");
  const [activePlatform, setActivePlatform] = useState<ComposerPlatform>("facebook");
  const [variantTexts, setVariantTexts] = useState<Record<ComposerPlatform, string>>(() =>
    createVariantTextMap()
  );
  const [variantWebsites, setVariantWebsites] = useState<Record<ComposerPlatform, string>>(() =>
    createVariantTextMap()
  );
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [sharedMedia, setSharedMedia] = useState<MediaAsset[]>([]);
  const [platformMediaByPlatform, setPlatformMediaByPlatform] = useState<Record<ComposerPlatform, MediaAsset[]>>(() =>
    createPlatformMediaMap()
  );
  const [mediaSourceByPlatform, setMediaSourceByPlatform] = useState<Record<ComposerPlatform, MediaSource>>(() =>
    createPlatformMediaSourceMap()
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishMode, setPublishMode] = useState<"draft" | "scheduled" | "now">("draft");
  const [result, setResult] = useState<ComposerPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const baseTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const copiedPostRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialWorkspaceId && workspaces.some((workspace) => workspace.id === initialWorkspaceId)) {
      setWorkspaceId(initialWorkspaceId);
    }
  }, [initialWorkspaceId, workspaces]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId),
    [workspaceId, workspaces]
  );
  const activeAccounts = useMemo(
    () => socialAccounts.filter((account) => account.status === "active"),
    [socialAccounts]
  );
  const selectedAccounts = useMemo(() => {
    const selectedIds = new Set(selectedAccountIds);
    return activeAccounts.filter((account) => selectedIds.has(account.id));
  }, [activeAccounts, selectedAccountIds]);
  const selectedPlatforms = useMemo(
    () => allComposerPlatforms.filter((platform) => selectedAccounts.some((account) => account.platform === platform)),
    [selectedAccounts]
  );
  const accountCountByPlatform = useMemo(
    () =>
      selectedAccounts.reduce<Partial<Record<ComposerPlatform, number>>>((counts, account) => {
        counts[account.platform] = (counts[account.platform] ?? 0) + 1;
        return counts;
      }, {}),
    [selectedAccounts]
  );
  const resolvedMediaByPlatform = useMemo(
    () =>
      allComposerPlatforms.reduce<Record<ComposerPlatform, MediaAsset[]>>((media, platform) => {
        media[platform] =
          mediaSourceByPlatform[platform] === "shared" ? sharedMedia : platformMediaByPlatform[platform];
        return media;
      }, {} as Record<ComposerPlatform, MediaAsset[]>),
    [mediaSourceByPlatform, platformMediaByPlatform, sharedMedia]
  );
  const activeMedia = resolvedMediaByPlatform[activePlatform];
  const activeMediaUsesShared = mediaSourceByPlatform[activePlatform] === "shared";
  const activePlatformLabel = platformLimits[activePlatform].label;
  const imageCount = activeMedia.filter((asset) => asset.mimeType.startsWith("image/")).length;
  const videoCount = activeMedia.filter((asset) => asset.mimeType.startsWith("video/")).length;
  const hasAnyVariantText = selectedPlatforms.some(
    (platform) => (variantTexts[platform] || baseText).trim().length > 0
  );
  const unsupportedPublishingPlatforms = selectedPlatforms.filter(
    (platform) => !realPublishingPlatforms.has(platform)
  );
  const requiresDraftOnly = publishMode !== "draft" && unsupportedPublishingPlatforms.length > 0;
  const unsupportedPublishingLabels = unsupportedPublishingPlatforms
    .map((platform) => platformLimits[platform].label)
    .join("、");
  const publishingLocked =
    selectedWorkspace?.publishingAccessStatus === "expired" ||
    selectedWorkspace?.publishingAccessStatus === "disabled";

  useEffect(() => {
    if (publishingLocked && publishMode !== "draft") {
      setPublishMode("draft");
    }
  }, [publishingLocked, publishMode]);

  useEffect(() => {
    if (!workspaceId) {
      setSocialAccounts([]);
      setSelectedAccountIds([]);
      return;
    }

    let cancelled = false;
    setAccountsLoading(true);
    setAccountError(null);
    setSocialAccounts([]);
    setSelectedAccountIds([]);
    setSharedMedia([]);
    setPlatformMediaByPlatform(createPlatformMediaMap());
    setMediaSourceByPlatform(createPlatformMediaSourceMap());

    async function loadAccountsAndCopiedPost() {
      try {
        const [accounts, copiedPost] = await Promise.all([
          apiRequest<SocialAccount[]>(`/workspaces/${workspaceId}/social-accounts`, { token }),
          copyPostId
            ? apiRequest<ComposerPostDetail>(`/workspaces/${workspaceId}/composer/posts/${copyPostId}`, { token })
            : Promise.resolve(null)
        ]);

        if (cancelled) {
          return;
        }

        const active = accounts.filter((account) => account.status === "active");
        const activePlatforms = allComposerPlatforms.filter((platform) =>
          active.some((account) => account.platform === platform)
        );

        setSocialAccounts(accounts);

        const copiedPostKey = copyPostId ? `${workspaceId}:${copyPostId}` : null;

        if (copiedPost && copiedPostKey && copiedPostRef.current !== copiedPostKey) {
          const reusableVariants = copiedPost.variants.filter(
            (variant) =>
              Boolean(variant.socialAccountId) &&
              active.some((account) => account.id === variant.socialAccountId)
          );
          const sharedVariant = reusableVariants[0] ?? copiedPost.variants[0];
          const sharedAssets = sharedVariant?.media.map((item) => item.mediaAsset) ?? [];
          const nextPlatformMedia = createPlatformMediaMap();
          const nextMediaSources = createPlatformMediaSourceMap();
          const nextTexts = createVariantTextMap(copiedPost.baseText);
          const sharedAssetIds = sharedAssets.map((asset) => asset.id).join(":");

          for (const platform of allComposerPlatforms) {
            const variant = copiedPost.variants.find((item) => item.platform === platform);

            if (!variant) {
              continue;
            }

            const assets = variant.media.map((item) => item.mediaAsset);
            nextTexts[platform] = variant.text;

            if (assets.map((asset) => asset.id).join(":") !== sharedAssetIds) {
              nextPlatformMedia[platform] = assets;
              nextMediaSources[platform] = "custom";
            }
          }

          setTitle(copiedPost.title ?? "");
          setBaseText(copiedPost.baseText);
          setBaseWebsite("");
          setVariantTexts(nextTexts);
          setVariantWebsites(createVariantTextMap());
          setSharedMedia(sharedAssets);
          setPlatformMediaByPlatform(nextPlatformMedia);
          setMediaSourceByPlatform(nextMediaSources);
          setSelectedAccountIds(
            reusableVariants.flatMap((variant) => (variant.socialAccountId ? [variant.socialAccountId] : []))
          );
          setActivePlatform(reusableVariants[0]?.platform ?? activePlatforms[0] ?? "facebook");
          setScheduledAt("");
          setPublishMode("draft");
          setResult(null);
          setCopyNotice(
            reusableVariants.length
              ? "已复制原帖内容、素材和可用账号。现在可微调后重新发布。"
              : "已复制原帖内容和素材；原发布账号目前不可用，请重新选择账号后发布。"
          );
          copiedPostRef.current = copiedPostKey;
        } else {
          setSelectedAccountIds(active.map((account) => account.id));
          setActivePlatform(activePlatforms[0] ?? "facebook");
          setCopyNotice(null);
        }
      } catch (requestError) {
        if (cancelled) {
          return;
        }

        setSocialAccounts([]);
        setSelectedAccountIds([]);
        setAccountError(requestError instanceof Error ? requestError.message : "无法读取已连接账号");
      } finally {
        if (!cancelled) {
          setAccountsLoading(false);
        }
      }
    }

    void loadAccountsAndCopiedPost();

    return () => {
      cancelled = true;
    };
  }, [copyPostId, token, workspaceId]);

  useEffect(() => {
    if (selectedPlatforms.length && !selectedPlatforms.includes(activePlatform)) {
      setActivePlatform(selectedPlatforms[0]);
    }
  }, [activePlatform, selectedPlatforms]);

  const publishChecks = [
    {
      label: "内容文案",
      done: baseText.trim().length > 0 || hasAnyVariantText
    },
    {
      label: "发布账号",
      done: selectedAccounts.length > 0,
      detail: selectedAccounts.length ? `已选 ${selectedAccounts.length} 个账号` : "请选择至少一个账号"
    },
    {
      label: publishMode === "scheduled" ? "定时发布时间" : "发布方式",
      done: true,
      detail:
        publishMode === "now"
          ? "保存后将立即分别发布"
          : publishMode === "scheduled"
            ? "已选择北京时间"
            : "将保存为草稿"
    }
  ];

  function toggleAccount(accountId: string) {
    setSelectedAccountIds((current) =>
      current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId]
    );
  }

  function toggleAllAccounts() {
    setSelectedAccountIds((current) => (current.length === activeAccounts.length ? [] : activeAccounts.map((account) => account.id)));
  }

  function applyBaseContent() {
    setVariantTexts(createVariantTextMap(baseText));
    setVariantWebsites(createVariantTextMap(baseWebsite));
  }

  function insertBaseText(value: string) {
    const textArea = baseTextAreaRef.current;
    const start = textArea?.selectionStart ?? baseText.length;
    const end = textArea?.selectionEnd ?? baseText.length;
    const nextText = `${baseText.slice(0, start)}${value}${baseText.slice(end)}`;

    setBaseText(nextText);
    requestAnimationFrame(() => {
      textArea?.focus();
      textArea?.setSelectionRange(start + value.length, start + value.length);
    });
  }

  function customizePlatformMedia() {
    setPlatformMediaByPlatform((current) => ({
      ...current,
      [activePlatform]: [...sharedMedia]
    }));
    setMediaSourceByPlatform((current) => ({
      ...current,
      [activePlatform]: "custom"
    }));
  }

  function restoreSharedMedia() {
    setPlatformMediaByPlatform((current) => ({
      ...current,
      [activePlatform]: []
    }));
    setMediaSourceByPlatform((current) => ({
      ...current,
      [activePlatform]: "shared"
    }));
  }

  async function savePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedWorkspace) {
      setError("请先选择工作区");
      return;
    }

    if (!selectedAccounts.length) {
      setError("请先选择至少一个已连接账号");
      return;
    }

    const hasInvalidWebsite = !isValidWebsite(baseWebsite) || selectedPlatforms.some(
      (platform) => !isValidWebsite(variantWebsites[platform] || baseWebsite)
    );

    if (hasInvalidWebsite) {
      setError("网站链接请输入以 http:// 或 https:// 开头的完整地址");
      return;
    }

    setError(null);
    setResult(null);
    setIsSaving(true);

    try {
      const post = await apiRequest<ComposerPost>(
        `/workspaces/${selectedWorkspace.id}/composer/posts`,
        {
          method: "POST",
          token,
          body: {
            title: title || undefined,
            baseText: appendWebsiteToText(baseText, baseWebsite),
            scheduledAt:
              publishMode === "scheduled" && scheduledAt
                ? chinaLocalInputToISOString(scheduledAt)
                : undefined,
            publishNow: publishMode === "now",
            variants: selectedAccounts.map((account) => ({
              socialAccountId: account.id,
              platform: account.platform,
              text: appendWebsiteToText(
                variantTexts[account.platform] || baseText,
                variantWebsites[account.platform] || baseWebsite
              ),
              mediaAssetIds: resolvedMediaByPlatform[account.platform].map((asset) => asset.id)
            }))
          }
        }
      );

      setResult(post);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法保存内容");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="composer-layout multi-account-composer" onSubmit={savePost}>
      <main className="composer-main">
        {copyNotice ? <p className="success-message composer-copy-notice">{copyNotice}</p> : null}
        <AccountTargetSelector
          accounts={activeAccounts}
          loading={accountsLoading}
          onToggleAccount={toggleAccount}
          onToggleAll={toggleAllAccounts}
          selectedAccountIds={selectedAccountIds}
        />

        <section className="composer-panel composer-head content-editor-panel">
          <div className="step-heading">
            <span className="step-badge">2</span>
            <div>
              <p className="section-kicker">内容编辑</p>
              <h2>编辑帖子内容</h2>
              <p className="muted">所有已选账号会使用基础内容；文案、链接和素材都可按平台单独调整。</p>
            </div>
          </div>

          <div className="row">
            <label className="field grow-field">
              <span>内部标题（可选）</span>
              <input
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：夏季新品发布"
                value={title}
              />
            </label>
            <button className="button secondary apply-copy-button" onClick={applyBaseContent} type="button">
              应用基础内容
            </button>
          </div>

          <label className="field">
            <span>帖子文案</span>
            <textarea
              className="composer-textarea compact"
              onChange={(event) => setBaseText(event.target.value)}
              placeholder="先写一版通用文案，发布前可按平台调整。"
              ref={baseTextAreaRef}
              required
              value={baseText}
            />
          </label>
          <TextInsertToolbar onInsert={insertBaseText} />
          <label className="field website-field">
            <span>基础网站链接（可选）</span>
            <input
              inputMode="url"
              onChange={(event) => setBaseWebsite(event.target.value)}
              placeholder="https://example.com"
              type="url"
              value={baseWebsite}
            />
            <small>默认会用于所有已选平台；可在平台版本中单独改写。</small>
          </label>
          <div className="content-summary">
            <span>{selectedAccounts.length} 个账号</span>
            <span>{activePlatformLabel}：{imageCount} 张图片</span>
            <span>{activePlatformLabel}：{videoCount} 个视频</span>
          </div>

          <PlatformTabs
            accountCountByPlatform={accountCountByPlatform}
            active={activePlatform}
            onActiveChange={setActivePlatform}
            platforms={selectedPlatforms}
          />
          {selectedPlatforms.length ? (
            <PlatformEditor
              mediaCount={activeMedia.length}
              onChange={(value) =>
                setVariantTexts((current) => ({
                  ...current,
                  [activePlatform]: value
                }))
              }
              onWebsiteChange={(value) =>
                setVariantWebsites((current) => ({
                  ...current,
                  [activePlatform]: value
                }))
              }
              platform={activePlatform}
              text={variantTexts[activePlatform] || baseText}
              website={variantWebsites[activePlatform] || baseWebsite}
            />
          ) : null}
        </section>

        {selectedWorkspace ? (
          <>
            <MediaUploader
              description="上传一次后，默认会用于全部已选平台；每个平台都可以从共用素材复制一份再单独调整。"
              disabled={publishingLocked}
              label="共用素材"
              media={sharedMedia}
              onMediaChange={setSharedMedia}
              token={token}
              workspaceId={selectedWorkspace.id}
            />

            {selectedPlatforms.length ? (
              <section className="composer-panel platform-media-control">
                <div className="row">
                  <div>
                    <p className="section-kicker">平台素材版本</p>
                    <h2>{activePlatformLabel}</h2>
                  </div>
                  <span className={activeMediaUsesShared ? "media-source-badge shared" : "media-source-badge custom"}>
                    {activeMediaUsesShared ? "使用共用素材" : "已单独调整"}
                  </span>
                </div>
                <p className="muted">
                  {activeMediaUsesShared
                    ? `当前 ${activePlatformLabel} 会使用全部 ${sharedMedia.length} 个共用素材。`
                    : `当前 ${activePlatformLabel} 使用独立素材，不会再随共用素材变化。`}
                </p>
                {activeMediaUsesShared ? (
                  <button className="button secondary" onClick={customizePlatformMedia} type="button">
                    从共用素材复制并单独调整
                  </button>
                ) : (
                  <button className="button secondary" onClick={restoreSharedMedia} type="button">
                    恢复使用共用素材
                  </button>
                )}
              </section>
            ) : null}

            {selectedPlatforms.length && !activeMediaUsesShared ? (
              <MediaUploader
                description={`这里只影响已选的 ${activePlatformLabel} 账号；可移除复制来的素材，或追加该平台专属图片和视频。`}
                disabled={publishingLocked}
                label={`${activePlatformLabel} 专属素材`}
                media={platformMediaByPlatform[activePlatform]}
                onMediaChange={(nextMedia) =>
                  setPlatformMediaByPlatform((current) => ({
                    ...current,
                    [activePlatform]: nextMedia
                  }))
                }
                token={token}
                workspaceId={selectedWorkspace.id}
              />
            ) : null}
          </>
        ) : null}
      </main>

      <aside className="composer-sidebar composer-settings-rail">
        <section className="composer-panel publishing-settings-panel">
          <div className="step-heading">
            <span className="step-badge">3</span>
            <div>
              <p className="section-kicker">发布设置</p>
              <h2>安排发布时间</h2>
            </div>
          </div>
          <label className="field">
            <span>工作区</span>
            <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="composer-panel publish-mode-panel">
          <div className="publish-mode-toggle" role="group" aria-label="选择发布方式">
            <button
              className={publishMode === "now" ? "active" : ""}
              disabled={publishingLocked}
              onClick={() => setPublishMode("now")}
              type="button"
            >
              立即发布
            </button>
            <button
              className={publishMode === "scheduled" ? "active" : ""}
              disabled={publishingLocked}
              onClick={() => setPublishMode("scheduled")}
              type="button"
            >
              定时发布
            </button>
            <button
              className={publishMode === "draft" ? "active" : ""}
              onClick={() => setPublishMode("draft")}
              type="button"
            >
              保存草稿
            </button>
          </div>
          {publishMode === "scheduled" ? <SchedulePicker onChange={setScheduledAt} value={scheduledAt} /> : null}
          {publishMode === "now" ? <p className="muted">确认后会为每个已选账号分别入队并立即发布。</p> : null}
          {publishMode === "draft" ? <p className="muted">稍后可从内容日历继续安排发布时间。</p> : null}
          {publishingLocked ? (
            <p className="error">
              测试权限已到期：可以登录、查看和保存草稿，但不能上传素材、立即发布或定时发布。
            </p>
          ) : null}
          {requiresDraftOnly ? (
            <p className="error">
              {unsupportedPublishingLabels} 暂不支持真实发布。请改为“保存草稿”，不要把它标记为已发布。
            </p>
          ) : null}
        </section>

        <PostPreview
          accounts={selectedAccounts}
          baseText={baseText}
          loading={accountsLoading}
          mediaByPlatform={resolvedMediaByPlatform}
          mediaSources={mediaSourceByPlatform}
          baseWebsite={baseWebsite}
          texts={variantTexts}
          websites={variantWebsites}
        />

        <section className="composer-panel checklist-panel publish-action-panel">
          <ul className="check-list">
            {publishChecks.map((item) => (
              <li className={item.done ? "done" : ""} key={item.label}>
                <span>{item.done ? "✓" : "!"}</span>
                <div>
                  <strong>{item.label}</strong>
                  {item.detail ? <small>{item.detail}</small> : null}
                </div>
              </li>
            ))}
          </ul>
          <button
            className="button publish-confirm-button"
            disabled={isSaving || !selectedAccounts.length || requiresDraftOnly}
            type="submit"
          >
            {isSaving
              ? "正在保存…"
              : requiresDraftOnly
                ? `${unsupportedPublishingLabels} 暂不支持真实发布`
              : publishMode === "now"
                ? `立即发布到 ${selectedAccounts.length} 个账号`
                : publishMode === "scheduled"
                  ? `确认定时发布到 ${selectedAccounts.length} 个账号`
                  : `保存 ${selectedAccounts.length} 个账号的草稿`}
          </button>
          {result ? (
            <p className="success-message">
              {publishMode === "now"
                ? `已为 ${selectedAccounts.length} 个账号分别创建即时发布任务。`
                : `已创建 ${selectedAccounts.length} 个独立发布任务。`}
            </p>
          ) : null}
          {accountError ? <p className="error">{accountError}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>
      </aside>
    </form>
  );
}
