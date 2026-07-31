"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  apiRequest,
  type ComposerPlatform,
  type ComposerPost,
  type ComposerPostDetail,
  type MediaAsset,
  type SocialAccount,
  type TikTokCreatorPublishInfo,
  type Workspace
} from "../../lib/api";
import { chinaLocalInputToISOString } from "../../lib/chinaTime";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "../../lib/activeWorkspace";
import { AccountTargetSelector } from "./AccountTargetSelector";
import { appendWebsiteToText, isValidWebsite } from "./contentUtils";
import { MediaUploader } from "./MediaUploader";
import { PlatformEditor, type WebsiteMode } from "./PlatformEditor";
import { platformLimits } from "./platformConfig";
import { PlatformTabs } from "./PlatformTabs";
import { PostPreview } from "./PostPreview";
import { SchedulePicker } from "./SchedulePicker";
import { TextInsertToolbar } from "./TextInsertToolbar";
import { TikTokPublishSettings, type TikTokPublishSettingsValue } from "./TikTokPublishSettings";
import { useLanguage } from "../LanguageProvider";

type ComposerFormProps = {
  token: string;
  workspaces: Workspace[];
  copyPostId?: string | null;
  draftPostId?: string | null;
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
const realPublishingPlatforms = new Set<ComposerPlatform>(["instagram", "facebook", "youtube", "tiktok"]);

type MediaSource = "shared" | "custom";

function createVariantTextMap(value = "") {
  return Object.fromEntries(
    allComposerPlatforms.map((platform) => [platform, value])
  ) as Record<ComposerPlatform, string>;
}

function createPlatformWebsiteModeMap(value: WebsiteMode = "inherit") {
  return Object.fromEntries(
    allComposerPlatforms.map((platform) => [platform, value])
  ) as Record<ComposerPlatform, WebsiteMode>;
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

function createTikTokPublishSettings(): TikTokPublishSettingsValue {
  return {
    privacyLevel: "",
    allowComment: false,
    allowDuet: false,
    allowStitch: false,
    consentConfirmed: false,
    brandOrganic: false,
    isAigc: false
  };
}

function readTikTokPublishSettings(value: Record<string, unknown> | undefined): TikTokPublishSettingsValue {
  const fallback = createTikTokPublishSettings();

  if (!value) {
    return fallback;
  }

  return {
    privacyLevel: typeof value.privacyLevel === "string" ? value.privacyLevel : "",
    allowComment: value.allowComment === true,
    allowDuet: value.allowDuet === true,
    allowStitch: value.allowStitch === true,
    consentConfirmed: value.consentConfirmed === true,
    brandOrganic: value.brandOrganic === true,
    isAigc: value.isAigc === true
  };
}

function isReusableMediaAsset(asset: MediaAsset) {
  return asset.originalAvailable !== false;
}

export function ComposerForm({ token, workspaces, copyPostId, draftPostId, initialWorkspaceId }: ComposerFormProps) {
  const { t } = useLanguage();
  const [workspaceId, setWorkspaceId] = useState("");
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
  const [variantWebsiteModes, setVariantWebsiteModes] = useState<Record<ComposerPlatform, WebsiteMode>>(() =>
    createPlatformWebsiteModeMap()
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
  const [tiktokCreatorInfoByAccount, setTikTokCreatorInfoByAccount] = useState<
    Record<string, TikTokCreatorPublishInfo | undefined>
  >({});
  const [tiktokSettingsByAccount, setTikTokSettingsByAccount] = useState<
    Record<string, TikTokPublishSettingsValue | undefined>
  >({});
  const [tiktokSettingsErrorByAccount, setTikTokSettingsErrorByAccount] = useState<
    Record<string, string | undefined>
  >({});
  const [tiktokSettingsLoadingAccountIds, setTikTokSettingsLoadingAccountIds] = useState<string[]>([]);
  const baseTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const copiedPostRef = useRef<string | null>(null);

  useEffect(() => {
    const nextWorkspaceId = getActiveWorkspaceId(workspaces, initialWorkspaceId || workspaceId);
    setWorkspaceId(nextWorkspaceId);
    setActiveWorkspaceId(nextWorkspaceId);
  }, [initialWorkspaceId, workspaces]);

  function selectWorkspace(nextWorkspaceId: string) {
    setActiveWorkspaceId(nextWorkspaceId);
    setWorkspaceId(nextWorkspaceId);
  }

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
  const selectedTikTokAccounts = useMemo(
    () => selectedAccounts.filter((account) => account.platform === "tiktok"),
    [selectedAccounts]
  );
  const selectedTikTokAccountIds = useMemo(
    () => selectedTikTokAccounts.map((account) => account.id).join(","),
    [selectedTikTokAccounts]
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
  const resolvedWebsitesByPlatform = useMemo(
    () =>
      allComposerPlatforms.reduce<Record<ComposerPlatform, string>>((websites, platform) => {
        const mode = variantWebsiteModes[platform];
        websites[platform] = mode === "inherit" ? baseWebsite : mode === "custom" ? variantWebsites[platform] : "";
        return websites;
      }, {} as Record<ComposerPlatform, string>),
    [baseWebsite, variantWebsiteModes, variantWebsites]
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
    setTikTokCreatorInfoByAccount({});
    setTikTokSettingsByAccount({});
    setTikTokSettingsErrorByAccount({});
    setTikTokSettingsLoadingAccountIds([]);

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
          const sharedAssets = sharedVariant?.media
            .map((item) => item.mediaAsset)
            .filter(isReusableMediaAsset) ?? [];
          const nextPlatformMedia = createPlatformMediaMap();
          const nextMediaSources = createPlatformMediaSourceMap();
          const nextTexts = createVariantTextMap(copiedPost.baseText);
          const nextTikTokSettings: Record<string, TikTokPublishSettingsValue | undefined> = {};
          const sharedAssetIds = sharedAssets.map((asset) => asset.id).join(":");

          for (const platform of allComposerPlatforms) {
            const variant = copiedPost.variants.find((item) => item.platform === platform);

            if (!variant) {
              continue;
            }

            const assets = variant.media
              .map((item) => item.mediaAsset)
              .filter(isReusableMediaAsset);
            nextTexts[platform] = variant.text;

            if (variant.platform === "tiktok" && variant.socialAccountId) {
              nextTikTokSettings[variant.socialAccountId] = readTikTokPublishSettings(variant.platformPayload);
            }

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
          setVariantWebsiteModes(createPlatformWebsiteModeMap());
          setSharedMedia(sharedAssets);
          setPlatformMediaByPlatform(nextPlatformMedia);
          setMediaSourceByPlatform(nextMediaSources);
          setTikTokSettingsByAccount(nextTikTokSettings);
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
          if (draftPostId) {
            setCopyNotice("已打开草稿。保存后会更新草稿，或按你选择的方式发布。");
          }
          if (
            copiedPost.variants.some((variant) =>
              variant.media.some(({ mediaAsset }) => mediaAsset.originalAvailable === false)
            )
          ) {
            setCopyNotice("已复制原帖文案。原素材已清理，请重新上传图片或视频后再发布。");
          }
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

  useEffect(() => {
    const accountIds = selectedTikTokAccountIds ? selectedTikTokAccountIds.split(",") : [];
    let cancelled = false;

    if (!workspaceId || !accountIds.length) {
      setTikTokSettingsLoadingAccountIds([]);
      return;
    }

    setTikTokSettingsLoadingAccountIds(accountIds);

    async function loadTikTokPublishSettings() {
      const results = await Promise.all(
        accountIds.map(async (socialAccountId) => {
          try {
            const creatorInfo = await apiRequest<TikTokCreatorPublishInfo>(
              `/workspaces/${workspaceId}/social-accounts/${socialAccountId}/tiktok-publish-options`,
              { token }
            );
            return { socialAccountId, creatorInfo };
          } catch (requestError) {
            return {
              socialAccountId,
              error: requestError instanceof Error ? requestError.message : "无法读取 TikTok 发布设置"
            };
          }
        })
      );

      if (cancelled) {
        return;
      }

      setTikTokCreatorInfoByAccount((current) => {
        const next = { ...current };
        for (const result of results) {
          next[result.socialAccountId] = result.creatorInfo;
        }
        return next;
      });
      setTikTokSettingsByAccount((current) => {
        const next = { ...current };
        for (const result of results) {
          next[result.socialAccountId] ??= createTikTokPublishSettings();
        }
        return next;
      });
      setTikTokSettingsErrorByAccount((current) => {
        const next = { ...current };
        for (const result of results) {
          next[result.socialAccountId] = result.error;
        }
        return next;
      });
      setTikTokSettingsLoadingAccountIds([]);
    }

    void loadTikTokPublishSettings();

    return () => {
      cancelled = true;
    };
  }, [selectedTikTokAccountIds, token, workspaceId]);

  const publishChecks = [
    {
      label: t("内容文案", "Post copy"),
      done: baseText.trim().length > 0 || hasAnyVariantText
    },
    {
      label: t("发布账号", "Publishing accounts"),
      done: selectedAccounts.length > 0,
      detail: selectedAccounts.length
        ? t(`已选 ${selectedAccounts.length} 个账号`, `${selectedAccounts.length} accounts selected`)
        : t("请选择至少一个账号", "Select at least one account")
    },
    {
      label: publishMode === "scheduled" ? t("定时发布时间", "Scheduled time") : t("发布方式", "Publishing method"),
      done: true,
      detail:
        publishMode === "now"
          ? t("保存后将立即分别发布", "Each account will publish immediately after saving")
          : publishMode === "scheduled"
            ? t("已选择北京时间", "Beijing time selected")
            : t("将保存为草稿", "Will be saved as a draft")
    }
  ];

  if (selectedTikTokAccounts.length && publishMode !== "draft") {
    publishChecks.push({
      label: t("TikTok 发布确认", "TikTok publishing confirmation"),
      done: selectedTikTokAccounts.every((account) => {
        const settings = tiktokSettingsByAccount[account.id];
        return Boolean(
          tiktokCreatorInfoByAccount[account.id] &&
            !tiktokSettingsErrorByAccount[account.id] &&
            settings?.privacyLevel &&
            settings.consentConfirmed
        );
      }),
      detail: t(
        "为每个 TikTok 账号选择隐私、互动权限并确认音乐使用声明",
        "Choose privacy and interaction permissions, and confirm music usage for each TikTok account"
      )
    });
  }

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

  function updateTikTokPublishSettings(socialAccountId: string, value: Partial<TikTokPublishSettingsValue>) {
    setTikTokSettingsByAccount((current) => ({
      ...current,
      [socialAccountId]: {
        ...(current[socialAccountId] ?? createTikTokPublishSettings()),
        ...value
      }
    }));
  }

  async function savePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedWorkspace) {
      setError(t("请先选择工作区", "Select a workspace first"));
      return;
    }

    if (!selectedAccounts.length) {
      setError(t("请先选择至少一个已连接账号", "Select at least one connected account"));
      return;
    }

    if (publishMode !== "draft" && selectedTikTokAccounts.length) {
      const tiktokMedia = resolvedMediaByPlatform.tiktok;
      const hasSingleVideo =
        tiktokMedia.length === 1 && tiktokMedia[0].mimeType.startsWith("video/");

      if (!hasSingleVideo) {
        setError(t("TikTok 真实发布需要为 TikTok 选择恰好一个 MP4、MOV 或 WebM 视频素材。", "TikTok publishing requires exactly one MP4, MOV, or WebM video."));
        return;
      }
    }

    if (publishMode !== "draft") {
      const incompleteTikTokAccount = selectedTikTokAccounts.find((account) => {
        const settings = tiktokSettingsByAccount[account.id];
        return Boolean(
          tiktokSettingsLoadingAccountIds.includes(account.id) ||
            tiktokSettingsErrorByAccount[account.id] ||
            !tiktokCreatorInfoByAccount[account.id] ||
            !settings?.privacyLevel ||
            !settings.consentConfirmed
        );
      });

      if (incompleteTikTokAccount) {
        setError(t(`请先完成 TikTok 账号「${incompleteTikTokAccount.displayName}」的发布设置和确认。`, `Complete the publishing settings and confirmation for TikTok account “${incompleteTikTokAccount.displayName}”.`));
        return;
      }
    }

    const hasInvalidWebsite = selectedPlatforms.some(
      (platform) => !isValidWebsite(resolvedWebsitesByPlatform[platform])
    );

    if (hasInvalidWebsite) {
      setError(t("网站链接请输入以 http:// 或 https:// 开头的完整地址", "Enter a complete website URL starting with http:// or https://"));
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
                resolvedWebsitesByPlatform[account.platform]
              ),
              mediaAssetIds: resolvedMediaByPlatform[account.platform].map((asset) => asset.id),
              platformPayload:
                account.platform === "tiktok"
                  ? tiktokSettingsByAccount[account.id] ?? createTikTokPublishSettings()
                  : {}
            }))
          }
        }
      );

      if (draftPostId && initialWorkspaceId === selectedWorkspace.id) {
        try {
          await apiRequest<{ ok: true }>(
            `/workspaces/${selectedWorkspace.id}/composer/drafts/${draftPostId}`,
            {
              method: "DELETE",
              token
            }
          );
          setCopyNotice(
            publishMode === "draft"
              ? t("草稿已更新，将从这次保存起保留 72 小时。", "Draft updated and kept for 72 hours from this save.")
              : t("草稿已转为新的发布内容，原草稿已删除。", "Draft converted to new publishing content and removed.")
          );
        } catch (deleteError) {
          setCopyNotice(
            t(
              `内容已保存，但原草稿未自动删除：${deleteError instanceof Error ? deleteError.message : "请在草稿箱手动删除。"}`,
              `Content saved, but the original draft was not removed automatically: ${deleteError instanceof Error ? deleteError.message : "delete it manually from Drafts."}`
            )
          );
        }
      }

      setResult(post);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("无法保存内容", "Unable to save content"));
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
              <p className="section-kicker">{t("内容编辑", "Content editor")}</p>
              <h2>{t("编辑帖子内容", "Edit post content")}</h2>
              <p className="muted">{t("所有已选账号会使用基础内容；文案、链接和素材都可按平台单独调整。", "Selected accounts use the base content. Copy, links, and media can be customized per platform.")}</p>
            </div>
          </div>

          <div className="row">
            <label className="field grow-field">
              <span>{t("内部标题（可选）", "Internal title (optional)")}</span>
              <input
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("例如：夏季新品发布", "For example: Summer product launch")}
                value={title}
              />
            </label>
            <button className="button secondary apply-copy-button" onClick={applyBaseContent} type="button">
              {t("应用基础内容", "Apply base content")}
            </button>
          </div>

          <label className="field">
            <span>{t("帖子文案", "Post copy")}</span>
            <textarea
              className="composer-textarea compact"
              onChange={(event) => setBaseText(event.target.value)}
              placeholder={t("先写一版通用文案，发布前可按平台调整。", "Write a base version first, then customize it for each platform.")}
              ref={baseTextAreaRef}
              required
              value={baseText}
            />
          </label>
          <TextInsertToolbar onInsert={insertBaseText} />
          <label className="field website-field">
            <span>{t("基础网站链接（可选）", "Base website link (optional)")}</span>
            <input
              inputMode="url"
              onChange={(event) => setBaseWebsite(event.target.value)}
              placeholder="https://example.com"
              type="url"
              value={baseWebsite}
            />
            <small>{t("默认会用于所有已选平台；可在平台版本中单独改写。", "Used for all selected platforms by default; customize it in each platform version if needed.")}</small>
          </label>
          <div className="content-summary">
            <span>{t(`${selectedAccounts.length} 个账号`, `${selectedAccounts.length} accounts`)}</span>
            <span>{t(`${activePlatformLabel}：${imageCount} 张图片`, `${activePlatformLabel}: ${imageCount} images`)}</span>
            <span>{t(`${activePlatformLabel}：${videoCount} 个视频`, `${activePlatformLabel}: ${videoCount} videos`)}</span>
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
              onWebsiteModeChange={(mode) => {
                if (mode === "custom" && variantWebsiteModes[activePlatform] === "inherit") {
                  setVariantWebsites((current) => ({
                    ...current,
                    [activePlatform]: current[activePlatform] || baseWebsite
                  }));
                }
                setVariantWebsiteModes((current) => ({
                  ...current,
                  [activePlatform]: mode
                }));
              }}
              platform={activePlatform}
              text={variantTexts[activePlatform] || baseText}
              baseWebsite={baseWebsite}
              website={variantWebsites[activePlatform]}
              websiteMode={variantWebsiteModes[activePlatform]}
            />
          ) : null}

          {activePlatform === "tiktok" && selectedTikTokAccounts.length ? (
            <TikTokPublishSettings
              accounts={selectedTikTokAccounts}
              creatorInfoByAccount={tiktokCreatorInfoByAccount}
              errorByAccount={tiktokSettingsErrorByAccount}
              loadingAccountIds={tiktokSettingsLoadingAccountIds}
              onChange={updateTikTokPublishSettings}
              settingsByAccount={tiktokSettingsByAccount}
            />
          ) : null}
        </section>

        {selectedWorkspace ? (
          <>
            <MediaUploader
              description={t("上传一次后，默认会用于全部已选平台；每个平台都可以从共用素材复制一份再单独调整。", "Upload once to use media on all selected platforms by default. Copy it to customize a platform separately.")}
              disabled={publishingLocked}
              label={t("共用素材", "Shared media")}
              media={sharedMedia}
              onMediaChange={setSharedMedia}
              token={token}
              workspaceId={selectedWorkspace.id}
            />

            {selectedPlatforms.length ? (
              <section className="composer-panel platform-media-control">
                <div className="row">
                  <div>
                    <p className="section-kicker">{t("平台素材版本", "Platform media version")}</p>
                    <h2>{activePlatformLabel}</h2>
                  </div>
                  <span className={activeMediaUsesShared ? "media-source-badge shared" : "media-source-badge custom"}>
                    {activeMediaUsesShared ? t("使用共用素材", "Using shared media") : t("已单独调整", "Customized")}
                  </span>
                </div>
                <p className="muted">
                  {activeMediaUsesShared
                    ? t(`当前 ${activePlatformLabel} 会使用全部 ${sharedMedia.length} 个共用素材。`, `${activePlatformLabel} uses all ${sharedMedia.length} shared media items.`)
                    : t(`当前 ${activePlatformLabel} 使用独立素材，不会再随共用素材变化。`, `${activePlatformLabel} has custom media and will no longer follow shared-media changes.`)}
                </p>
                {activeMediaUsesShared ? (
                  <button className="button secondary" onClick={customizePlatformMedia} type="button">
                    {t("从共用素材复制并单独调整", "Copy shared media and customize")}
                  </button>
                ) : (
                  <button className="button secondary" onClick={restoreSharedMedia} type="button">
                    {t("恢复使用共用素材", "Use shared media again")}
                  </button>
                )}
              </section>
            ) : null}

            {selectedPlatforms.length && !activeMediaUsesShared ? (
              <MediaUploader
                description={t(`这里只影响已选的 ${activePlatformLabel} 账号；可移除复制来的素材，或追加该平台专属图片和视频。`, `Only selected ${activePlatformLabel} accounts are affected. Remove copied media or add platform-specific images and videos.`)}
                disabled={publishingLocked}
                label={t(`${activePlatformLabel} 专属素材`, `${activePlatformLabel} media`) }
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
              <p className="section-kicker">{t("发布设置", "Publishing settings")}</p>
              <h2>{t("安排发布时间", "Choose publishing time")}</h2>
            </div>
          </div>
          <label className="field">
            <span>{t("工作区", "Workspace")}</span>
            <select value={workspaceId} onChange={(event) => selectWorkspace(event.target.value)}>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="composer-panel publish-mode-panel">
          <div className="publish-mode-toggle" role="group" aria-label={t("选择发布方式", "Choose publishing method")}>
            <button
              className={publishMode === "now" ? "active" : ""}
              disabled={publishingLocked}
              onClick={() => setPublishMode("now")}
              type="button"
            >
              {t("立即发布", "Publish now")}
            </button>
            <button
              className={publishMode === "scheduled" ? "active" : ""}
              disabled={publishingLocked}
              onClick={() => setPublishMode("scheduled")}
              type="button"
            >
              {t("定时发布", "Schedule")}
            </button>
            <button
              className={publishMode === "draft" ? "active" : ""}
              onClick={() => setPublishMode("draft")}
              type="button"
            >
              {t("保存草稿", "Save draft")}
            </button>
          </div>
          {publishMode === "scheduled" ? <SchedulePicker onChange={setScheduledAt} value={scheduledAt} /> : null}
          {publishMode === "now" ? <p className="muted">{t("确认后会为每个已选账号分别入队并立即发布。", "After confirmation, each selected account is queued and published immediately.")}</p> : null}
          {publishMode === "draft" ? <p className="muted">{t("稍后可从内容日历继续安排发布时间。", "You can schedule it later from the content calendar.")}</p> : null}
          {publishingLocked ? (
            <p className="error">
              {t("测试权限已到期：可以登录、查看和保存草稿，但不能上传素材、立即发布或定时发布。", "Test access has expired: you can sign in, view, and save drafts, but cannot upload media, publish now, or schedule posts.")}
            </p>
          ) : null}
          {requiresDraftOnly ? (
            <p className="error">
              {t(`${unsupportedPublishingLabels} 暂不支持真实发布。请改为“保存草稿”，不要把它标记为已发布。`, `${unsupportedPublishingLabels} does not support real publishing yet. Save a draft instead; it will not be marked as published.`)}
            </p>
          ) : null}
        </section>

        <PostPreview
          accounts={selectedAccounts}
          baseText={baseText}
          loading={accountsLoading}
          mediaByPlatform={resolvedMediaByPlatform}
          mediaSources={mediaSourceByPlatform}
          texts={variantTexts}
          websites={resolvedWebsitesByPlatform}
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
                ? t("正在保存…", "Saving...")
              : requiresDraftOnly
                ? t(`${unsupportedPublishingLabels} 暂不支持真实发布`, `${unsupportedPublishingLabels} real publishing is not supported`)
              : publishMode === "now"
                ? t(`立即发布到 ${selectedAccounts.length} 个账号`, `Publish now to ${selectedAccounts.length} accounts`)
                : publishMode === "scheduled"
                  ? t(`确认定时发布到 ${selectedAccounts.length} 个账号`, `Confirm schedule for ${selectedAccounts.length} accounts`)
                  : t(`保存 ${selectedAccounts.length} 个账号的草稿`, `Save draft for ${selectedAccounts.length} accounts`) }
          </button>
          {result ? (
            <p className="success-message">
              {publishMode === "now"
                ? t(`已为 ${selectedAccounts.length} 个账号分别创建即时发布任务。`, `An immediate publishing task was created for each of ${selectedAccounts.length} accounts.`)
                : t(`已创建 ${selectedAccounts.length} 个独立发布任务。`, `${selectedAccounts.length} independent publishing tasks were created.`)}
            </p>
          ) : null}
          {accountError ? <p className="error">{accountError}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>
      </aside>
    </form>
  );
}
