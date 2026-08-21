"use client";

import type { PinterestBoard } from "../../lib/api";
import { useLanguage } from "../LanguageProvider";

export type PinterestPinSettingsValue = {
  boardId: string;
  boardName?: string;
  title: string;
};

type PinterestPinSettingsProps = {
  accounts: Array<{ id: string; displayName: string }>;
  boardsByAccount: Record<string, PinterestBoard[] | undefined>;
  errorByAccount: Record<string, string | undefined>;
  loadingAccountIds: string[];
  settingsByAccount: Record<string, PinterestPinSettingsValue | undefined>;
  onChange: (socialAccountId: string, value: Partial<PinterestPinSettingsValue>) => void;
};

export function PinterestPinSettings({
  accounts,
  boardsByAccount,
  errorByAccount,
  loadingAccountIds,
  settingsByAccount,
  onChange
}: PinterestPinSettingsProps) {
  const { t } = useLanguage();

  return (
    <section className="composer-panel pinterest-pin-settings">
      <div>
        <p className="section-kicker">{t("Pinterest Pin 设置", "Pinterest Pin settings")}</p>
        <h2>{t("发布图片 Pin", "Publish an image Pin")}</h2>
        <p className="muted">
          {t("每个 Pinterest 账号都需要选择看板并填写 Pin 标题。网站链接会作为 Pin 的跳转地址，不会加入文案。", "Choose a board and enter a Pin title for every Pinterest account. The website link becomes the Pin destination and is not added to the description.")}
        </p>
      </div>

      {accounts.map((account) => {
        const boards = boardsByAccount[account.id];
        const settings = settingsByAccount[account.id];
        const isLoading = loadingAccountIds.includes(account.id);
        const error = errorByAccount[account.id];

        return (
          <div className="pinterest-settings-card" key={account.id}>
            <strong>{account.displayName}</strong>
            {isLoading ? <p className="muted">{t("正在读取 Pinterest 看板…", "Loading Pinterest boards...")}</p> : null}
            {error ? <p className="error-message">{error}</p> : null}
            {boards && !boards.length ? <p className="error-message">{t("此 Pinterest 账号没有可用看板。请先在 Pinterest 创建看板后刷新。", "This Pinterest account has no available boards. Create a board on Pinterest, then refresh.")}</p> : null}
            {boards?.length && settings ? (
              <>
                <label className="field">
                  <span>{t("选择看板 *", "Board *")}</span>
                  <select
                    onChange={(event) => {
                      const board = boards.find((item) => item.id === event.target.value);
                      onChange(account.id, { boardId: event.target.value, boardName: board?.name });
                    }}
                    required
                    value={settings.boardId}
                  >
                    <option value="">{t("请选择 Pinterest 看板", "Choose a Pinterest board")}</option>
                    {boards.map((board) => (
                      <option key={board.id} value={board.id}>
                        {board.name}{board.privacy ? ` · ${board.privacy}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t("Pin 标题 *", "Pin title *")}</span>
                  <input
                    maxLength={100}
                    onChange={(event) => onChange(account.id, { title: event.target.value })}
                    placeholder={t("最多 100 个字符", "Up to 100 characters")}
                    required
                    value={settings.title}
                  />
                </label>
              </>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
