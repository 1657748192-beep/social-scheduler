"use client";

import { useEffect, useRef, useState } from "react";
import type { ComposerPlatform, MediaAsset } from "../../lib/api";
import { appendWebsiteToText } from "./contentUtils";
import type { PinterestPinSettingsValue } from "./PinterestPinSettings";
import { platformLimits, type ComposerSocialAccount } from "./platformConfig";
import { useLanguage } from "../LanguageProvider";
import { PlatformPostPreview } from "./PlatformPostPreview";

type PostPreviewProps = {
  accounts: ComposerSocialAccount[];
  texts: Record<ComposerPlatform, string>;
  websites: Record<ComposerPlatform, string>;
  baseText: string;
  mediaByPlatform: Record<ComposerPlatform, MediaAsset[]>;
  mediaSources: Record<ComposerPlatform, "shared" | "custom">;
  pinterestSettingsByAccount: Record<string, PinterestPinSettingsValue | undefined>;
  loading: boolean;
};

export function PostPreview({
  accounts,
  texts,
  websites,
  baseText,
  mediaByPlatform,
  mediaSources,
  pinterestSettingsByAccount,
  loading
}: PostPreviewProps) {
  const { t } = useLanguage();
  const [previewPlatform, setPreviewPlatform] = useState<ComposerPlatform | null>(null);
  const [previewAccountId, setPreviewAccountId] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!previewPlatform || !dialogRef.current) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current.focus();
    return () => { document.body.style.overflow = previousOverflow; previous?.focus?.(); };
  }, [previewPlatform]);
  const groups = new Map<ComposerPlatform, ComposerSocialAccount[]>();
  const selectedPlatforms = Array.from(new Set(accounts.map((account) => account.platform)));
  const totalMediaCount = selectedPlatforms.reduce(
    (count, platform) => count + mediaByPlatform[platform].length,
    0
  );

  for (const account of accounts) {
    groups.set(account.platform, [...(groups.get(account.platform) ?? []), account]);
  }

  const previewAccounts = previewPlatform ? groups.get(previewPlatform) ?? [] : [];
  const previewText = previewPlatform
    ? previewPlatform === "pinterest"
      ? texts.pinterest || baseText
      : appendWebsiteToText(texts[previewPlatform] || baseText, websites[previewPlatform])
    : "";
  const previewMedia = previewPlatform ? mediaByPlatform[previewPlatform] : [];
  const previewAccount = previewAccounts.find(account => account.id === previewAccountId) ?? previewAccounts[0];
  const pinterestPinTitle =
    previewPlatform === "pinterest" && previewAccount
      ? pinterestSettingsByAccount[previewAccount.id]?.title.trim()
      : "";

  return (
    <>
    <section className="composer-panel publish-summary-panel">
      <div className="row">
        <div>
          <p className="section-kicker">{t("发布摘要", "Publishing summary")}</p>
          <h2>{t(`将创建 ${accounts.length} 个任务`, `${accounts.length} tasks will be created`)}</h2>
        </div>
        <span className="muted">{t(`${totalMediaCount} 个平台素材`, `${totalMediaCount} platform media items`)}</span>
      </div>

      <p className="muted">{t("共用素材会复用到每个平台；单独调整的平台使用自己的专属素材。", "Shared media is reused on every platform. Customized platforms use their own media.")}</p>

      {loading ? <p className="muted">{t("正在读取目标账号…", "Loading target accounts...")}</p> : null}
      {!loading && !accounts.length ? <p className="muted">{t("请先在左侧选择至少一个已连接账号。", "Select at least one connected account on the left.")}</p> : null}

      <div className="publish-summary-list">
        {[...groups.entries()].map(([platform, platformAccounts]) => {
          const limit = platformLimits[platform];
          const text =
            platform === "pinterest"
              ? texts.pinterest || baseText
              : appendWebsiteToText(texts[platform] || baseText, websites[platform]);
          const platformMedia = mediaByPlatform[platform];
          const mediaSource = mediaSources[platform];

          return (
            <article className="publish-summary-group" key={platform}>
              <div className="publish-summary-heading">
                <strong>{limit.label}</strong>
                <span>
                  {t(`${platformAccounts.length} 个账号 · ${platformMedia.length} 个素材 · ${mediaSource === "shared" ? "共用" : "专属"}`, `${platformAccounts.length} accounts · ${platformMedia.length} media items · ${mediaSource === "shared" ? "shared" : "custom"}`)}
                </span>
              </div>
              <p>{text || t("将使用基础文案", "Base copy will be used")}</p>
              <p className="muted">
                {mediaSource === "shared"
                  ? t("使用共用素材，会随基础素材的增删自动同步。", "Using shared media; it automatically follows changes to base media.")
                  : t("使用专属素材，只会发到该平台的全部已选账号。", "Using custom media; it will publish only to selected accounts on this platform.")}
              </p>
              <div className="publish-summary-footer">
                <div className="account-chip-list">
                  {platformAccounts.slice(0, 4).map((account) => (
                    <span className="account-chip" key={account.id}>{account.displayName}</span>
                  ))}
                  {platformAccounts.length > 4 ? <span className="account-chip">+{platformAccounts.length - 4}</span> : null}
                </div>
                <button className="button secondary publish-preview-button" onClick={() => { setPreviewAccountId(platformAccounts[0]?.id ?? ""); setPreviewPlatform(platform); }} type="button">
                  {t("预览效果", "Preview")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>

    {previewPlatform ? (
      <div
        className="publish-preview-backdrop"
        onClick={() => setPreviewPlatform(null)}
        role="presentation"
      >
        <section
          aria-label={t(`${platformLimits[previewPlatform].label} 发布预览`, `${platformLimits[previewPlatform].label} publishing preview`)}
          aria-modal="true"
          ref={dialogRef}
          tabIndex={-1}
          className="publish-preview-dialog"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.stopPropagation(); setPreviewPlatform(null); }
            if (event.key === "Tab") {
              const nodes = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),select,video[controls],a[href],[tabindex="0"]');
              const first = nodes[0], last = nodes[nodes.length - 1];
              if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
          }}
        >
          <header className="publish-preview-header">
            <div>
              <p className="section-kicker">{t("发布前预览", "Pre-publishing preview")}</p>
              <h2>{t(`${platformLimits[previewPlatform].label} 效果`, `${platformLimits[previewPlatform].label} preview`)}</h2>
              <span>{t(`${previewAccounts.length} 个账号会使用这份内容`, `${previewAccounts.length} accounts will use this content`)}</span>
            </div>
            <button aria-label={t("关闭预览", "Close preview")} onClick={() => setPreviewPlatform(null)} type="button">
              ×
            </button>
          </header>

          {previewAccounts.length > 1 ? <label className="publish-preview-account-picker">{t("预览账号", "Preview account")}
            <select aria-label={t("预览账号", "Preview account")} value={previewAccount?.id ?? ""} onChange={event => setPreviewAccountId(event.target.value)}>
              {previewAccounts.map(account => <option key={account.id} value={account.id}>{account.displayName}</option>)}
            </select>
          </label> : null}

          <div className="publish-preview-body">
            <PlatformPostPreview key={`${previewPlatform}:${previewAccount?.id}`} platform={previewPlatform} account={previewAccount} text={previewText} media={previewMedia} pinTitle={pinterestPinTitle} destination={previewPlatform === "pinterest" ? websites.pinterest : undefined} />
            <p className="publish-preview-disclaimer">{t("手机端样式模拟，实际展示可能因平台版本、设备和素材比例不同而变化。操作图标仅作示意，不显示模拟互动数据。", "Simulated mobile layout. Actual appearance varies by platform version, device and media ratio. Actions are illustrative; no engagement figures are invented.")}</p>
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}
