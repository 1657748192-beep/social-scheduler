"use client";

import type { TikTokCreatorPublishInfo } from "../../lib/api";
import { useLanguage } from "../LanguageProvider";

export type TikTokPublishSettingsValue = {
  privacyLevel: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  consentConfirmed: boolean;
  brandOrganic: boolean;
  isAigc: boolean;
};

type TikTokPublishSettingsProps = {
  accounts: Array<{ id: string; displayName: string }>;
  creatorInfoByAccount: Record<string, TikTokCreatorPublishInfo | undefined>;
  errorByAccount: Record<string, string | undefined>;
  loadingAccountIds: string[];
  settingsByAccount: Record<string, TikTokPublishSettingsValue | undefined>;
  onChange: (socialAccountId: string, value: Partial<TikTokPublishSettingsValue>) => void;
};

const privacyLabels: Record<string, [string, string]> = {
  PUBLIC_TO_EVERYONE: ["所有人可见", "Everyone"],
  MUTUAL_FOLLOW_FRIENDS: ["互关好友可见", "Friends"],
  FOLLOWER_OF_CREATOR: ["关注者可见", "Followers"],
  SELF_ONLY: ["仅自己可见", "Only me"]
};

export function TikTokPublishSettings({
  accounts,
  creatorInfoByAccount,
  errorByAccount,
  loadingAccountIds,
  settingsByAccount,
  onChange
}: TikTokPublishSettingsProps) {
  const { t, locale } = useLanguage();
  return (
    <section className="composer-panel tiktok-publish-settings">
      <div className="row">
        <div>
          <p className="section-kicker">{t("TikTok 发布设置", "TikTok publishing settings")}</p>
          <h2>{t("视频发布到 TikTok", "Publish video to TikTok")}</h2>
          <p className="muted">{t("发布前请选择隐私和互动权限，并确认 TikTok 的音乐使用声明。", "Choose privacy and interaction settings, then confirm TikTok music usage before publishing.")}</p>
        </div>
      </div>

      {accounts.map((account) => {
        const creatorInfo = creatorInfoByAccount[account.id];
        const settings = settingsByAccount[account.id];
        const isLoading = loadingAccountIds.includes(account.id);
        const error = errorByAccount[account.id];

        return (
          <div className="tiktok-settings-card" key={account.id}>
            <div className="tiktok-settings-account">
              <strong>{creatorInfo?.creatorNickname || account.displayName}</strong>
              {creatorInfo ? <span>@{creatorInfo.creatorUsername}</span> : null}
            </div>

            {isLoading ? <p className="muted">{t("正在读取 TikTok 账号可用的发布设置…", "Loading available publishing settings for this TikTok account...")}</p> : null}
            {error ? <p className="error-message">{error}</p> : null}

            {creatorInfo && settings ? (
              <>
                {!creatorInfo.directPostAudited ? (
                  <p className="tiktok-private-notice">
                    {t("当前 TikTok 应用尚未通过发布审核，本次视频只能选择“仅自己可见”。", "This TikTok app has not passed publishing review yet. This video can only be visible to you.")}
                  </p>
                ) : null}

                <label className="field">
                  <span>{t("隐私设置 *", "Privacy setting *")}</span>
                  <select
                    onChange={(event) => onChange(account.id, { privacyLevel: event.target.value })}
                    required
                    value={settings.privacyLevel}
                  >
                    <option value="">{t("请选择隐私设置", "Choose a privacy setting")}</option>
                    {creatorInfo.privacyLevelOptions.map((privacyLevel) => {
                      const blockedByAudit = !creatorInfo.directPostAudited && privacyLevel !== "SELF_ONLY";
                      return (
                        <option disabled={blockedByAudit} key={privacyLevel} value={privacyLevel}>
                          {privacyLabels[privacyLevel]?.[locale === "en" ? 1 : 0] ?? privacyLevel}
                          {blockedByAudit ? t("（应用审核前不可用）", " (unavailable until app review is approved)") : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <div className="tiktok-interaction-options">
                  <label>
                    <input
                      checked={settings.allowComment}
                      disabled={creatorInfo.commentDisabled}
                      onChange={(event) => onChange(account.id, { allowComment: event.target.checked })}
                      type="checkbox"
                    />
                    {t("允许评论", "Allow comments")}{creatorInfo.commentDisabled ? t("（该账号已关闭）", " (disabled for this account)") : ""}
                  </label>
                  <label>
                    <input
                      checked={settings.allowDuet}
                      disabled={creatorInfo.duetDisabled}
                      onChange={(event) => onChange(account.id, { allowDuet: event.target.checked })}
                      type="checkbox"
                    />
                    {t("允许合拍", "Allow Duet")}{creatorInfo.duetDisabled ? t("（该账号已关闭）", " (disabled for this account)") : ""}
                  </label>
                  <label>
                    <input
                      checked={settings.allowStitch}
                      disabled={creatorInfo.stitchDisabled}
                      onChange={(event) => onChange(account.id, { allowStitch: event.target.checked })}
                      type="checkbox"
                    />
                    {t("允许拼接", "Allow Stitch")}{creatorInfo.stitchDisabled ? t("（该账号已关闭）", " (disabled for this account)") : ""}
                  </label>
                </div>

                <div className="tiktok-interaction-options optional">
                  <label>
                    <input
                      checked={settings.brandOrganic}
                      onChange={(event) => onChange(account.id, { brandOrganic: event.target.checked })}
                      type="checkbox"
                    />
                    {t("推广我自己的品牌/产品", "Promote my own brand/product")}
                  </label>
                  <label>
                    <input
                      checked={settings.isAigc}
                      onChange={(event) => onChange(account.id, { isAigc: event.target.checked })}
                      type="checkbox"
                    />
                    {t("此视频由 AI 生成", "This video was generated by AI")}
                  </label>
                </div>

                <label className="tiktok-consent">
                  <input
                    checked={settings.consentConfirmed}
                    onChange={(event) => onChange(account.id, { consentConfirmed: event.target.checked })}
                    required
                    type="checkbox"
                  />
                  {t("我确认：发布即表示同意 TikTok 的音乐使用确认；视频可能需要数分钟处理后才会显示在主页。", "I confirm that publishing means I agree to TikTok's music usage confirmation. The video may take a few minutes to appear on the profile.")}
                </label>
              </>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
