"use client";

import type { TikTokCreatorPublishInfo } from "../../lib/api";

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

const privacyLabels: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "所有人可见",
  MUTUAL_FOLLOW_FRIENDS: "互关好友可见",
  FOLLOWER_OF_CREATOR: "关注者可见",
  SELF_ONLY: "仅自己可见"
};

export function TikTokPublishSettings({
  accounts,
  creatorInfoByAccount,
  errorByAccount,
  loadingAccountIds,
  settingsByAccount,
  onChange
}: TikTokPublishSettingsProps) {
  return (
    <section className="composer-panel tiktok-publish-settings">
      <div className="row">
        <div>
          <p className="section-kicker">TikTok 发布设置</p>
          <h2>视频发布到 TikTok</h2>
          <p className="muted">发布前请选择隐私和互动权限，并确认 TikTok 的音乐使用声明。</p>
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

            {isLoading ? <p className="muted">正在读取 TikTok 账号可用的发布设置…</p> : null}
            {error ? <p className="error-message">{error}</p> : null}

            {creatorInfo && settings ? (
              <>
                {!creatorInfo.directPostAudited ? (
                  <p className="tiktok-private-notice">
                    当前 TikTok 应用尚未通过发布审核，本次视频只能选择“仅自己可见”。
                  </p>
                ) : null}

                <label className="field">
                  <span>隐私设置 *</span>
                  <select
                    onChange={(event) => onChange(account.id, { privacyLevel: event.target.value })}
                    required
                    value={settings.privacyLevel}
                  >
                    <option value="">请选择隐私设置</option>
                    {creatorInfo.privacyLevelOptions.map((privacyLevel) => {
                      const blockedByAudit = !creatorInfo.directPostAudited && privacyLevel !== "SELF_ONLY";
                      return (
                        <option disabled={blockedByAudit} key={privacyLevel} value={privacyLevel}>
                          {privacyLabels[privacyLevel] ?? privacyLevel}
                          {blockedByAudit ? "（应用审核前不可用）" : ""}
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
                    允许评论{creatorInfo.commentDisabled ? "（该账号已关闭）" : ""}
                  </label>
                  <label>
                    <input
                      checked={settings.allowDuet}
                      disabled={creatorInfo.duetDisabled}
                      onChange={(event) => onChange(account.id, { allowDuet: event.target.checked })}
                      type="checkbox"
                    />
                    允许合拍{creatorInfo.duetDisabled ? "（该账号已关闭）" : ""}
                  </label>
                  <label>
                    <input
                      checked={settings.allowStitch}
                      disabled={creatorInfo.stitchDisabled}
                      onChange={(event) => onChange(account.id, { allowStitch: event.target.checked })}
                      type="checkbox"
                    />
                    允许拼接{creatorInfo.stitchDisabled ? "（该账号已关闭）" : ""}
                  </label>
                </div>

                <div className="tiktok-interaction-options optional">
                  <label>
                    <input
                      checked={settings.brandOrganic}
                      onChange={(event) => onChange(account.id, { brandOrganic: event.target.checked })}
                      type="checkbox"
                    />
                    推广我自己的品牌/产品
                  </label>
                  <label>
                    <input
                      checked={settings.isAigc}
                      onChange={(event) => onChange(account.id, { isAigc: event.target.checked })}
                      type="checkbox"
                    />
                    此视频由 AI 生成
                  </label>
                </div>

                <label className="tiktok-consent">
                  <input
                    checked={settings.consentConfirmed}
                    onChange={(event) => onChange(account.id, { consentConfirmed: event.target.checked })}
                    required
                    type="checkbox"
                  />
                  我确认：发布即表示同意 TikTok 的音乐使用确认；视频可能需要数分钟处理后才会显示在主页。
                </label>
              </>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
