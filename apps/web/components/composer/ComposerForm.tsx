"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  apiRequest,
  type ComposerPlatform,
  type ComposerPost,
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

export function ComposerForm({ token, workspaces }: ComposerFormProps) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
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
  const [mediaByPlatform, setMediaByPlatform] = useState<Record<ComposerPlatform, MediaAsset[]>>(() =>
    createPlatformMediaMap()
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishMode, setPublishMode] = useState<"draft" | "scheduled" | "now">("draft");
  const [result, setResult] = useState<ComposerPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const baseTextAreaRef = useRef<HTMLTextAreaElement>(null);

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
  const activeMedia = mediaByPlatform[activePlatform];
  const activePlatformLabel = platformLimits[activePlatform].label;
  const imageCount = activeMedia.filter((asset) => asset.mimeType.startsWith("image/")).length;
  const videoCount = activeMedia.filter((asset) => asset.mimeType.startsWith("video/")).length;
  const hasAnyVariantText = selectedPlatforms.some(
    (platform) => (variantTexts[platform] || baseText).trim().length > 0
  );

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
    setMediaByPlatform(createPlatformMediaMap());

    apiRequest<SocialAccount[]>(`/workspaces/${workspaceId}/social-accounts`, { token })
      .then((accounts) => {
        if (cancelled) {
          return;
        }

        const active = accounts.filter((account) => account.status === "active");
        const activePlatforms = allComposerPlatforms.filter((platform) =>
          active.some((account) => account.platform === platform)
        );

        setSocialAccounts(accounts);
        setSelectedAccountIds(active.map((account) => account.id));
        setActivePlatform(activePlatforms[0] ?? "facebook");
      })
      .catch((requestError) => {
        if (cancelled) {
          return;
        }

        setSocialAccounts([]);
        setSelectedAccountIds([]);
        setAccountError(requestError instanceof Error ? requestError.message : "无法读取已连接账号");
      })
      .finally(() => {
        if (!cancelled) {
          setAccountsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, workspaceId]);

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
              mediaAssetIds: mediaByPlatform[account.platform].map((asset) => asset.id)
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
              <p className="muted">所有已选账号会使用此内容；可按平台单独调整文案。</p>
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
          <MediaUploader
            media={activeMedia}
            onMediaChange={(nextMedia) =>
              setMediaByPlatform((current) => ({
                ...current,
                [activePlatform]: nextMedia
              }))
            }
            platformLabel={platformLimits[activePlatform].label}
            token={token}
            workspaceId={selectedWorkspace.id}
          />
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
              onClick={() => setPublishMode("now")}
              type="button"
            >
              立即发布
            </button>
            <button
              className={publishMode === "scheduled" ? "active" : ""}
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
        </section>

        <PostPreview
          accounts={selectedAccounts}
          baseText={baseText}
          loading={accountsLoading}
          mediaByPlatform={mediaByPlatform}
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
          <button className="button publish-confirm-button" disabled={isSaving || !selectedAccounts.length} type="submit">
            {isSaving
              ? "正在保存…"
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
