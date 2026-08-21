"use client";

import { useState } from "react";
import type { PinterestBoard } from "../../lib/api";
import { useLanguage } from "../LanguageProvider";

export type PinterestPinSettingsValue = {
  boardId: string;
  boardName?: string;
  title: string;
};

type PinterestPinSettingsProps = {
  accounts: Array<{ id: string; displayName: string; pinterestApiEnvironment?: "production" | "sandbox" }>;
  boardsByAccount: Record<string, PinterestBoard[] | undefined>;
  errorByAccount: Record<string, string | undefined>;
  loadingAccountIds: string[];
  settingsByAccount: Record<string, PinterestPinSettingsValue | undefined>;
  onChange: (socialAccountId: string, value: Partial<PinterestPinSettingsValue>) => void;
  creatingAccountIds: string[];
  onCreateBoard: (socialAccountId: string, name: string) => Promise<void>;
};

export function PinterestPinSettings({
  accounts,
  boardsByAccount,
  errorByAccount,
  loadingAccountIds,
  settingsByAccount,
  onChange,
  creatingAccountIds,
  onCreateBoard
}: PinterestPinSettingsProps) {
  const { t } = useLanguage();
  const [newBoardNameByAccount, setNewBoardNameByAccount] = useState<Record<string, string>>({});

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
        const isCreating = creatingAccountIds.includes(account.id);
        const error = errorByAccount[account.id];
        const isSandbox = account.pinterestApiEnvironment === "sandbox";
        const newBoardName = newBoardNameByAccount[account.id] ?? "";

        return (
          <div className="pinterest-settings-card" key={account.id}>
            <strong>{account.displayName}</strong>
            {isSandbox ? (
              <p className="notice-message">
                {t(
                  "Pinterest Sandbox 测试模式：创建的看板和 Pin 仅用于测试，不会显示为公开正式内容。",
                  "Pinterest Sandbox test mode: boards and Pins are for testing only and are not public production content."
                )}
              </p>
            ) : null}
            {isLoading ? <p className="muted">{t("正在读取 Pinterest 看板…", "Loading Pinterest boards...")}</p> : null}
            {error ? <p className="error-message">{error}</p> : null}
            {boards && !boards.length && !isSandbox ? <p className="error-message">{t("此 Pinterest 账号没有可用看板。请先在 Pinterest 创建看板后刷新。", "This Pinterest account has no available boards. Create a board on Pinterest, then refresh.")}</p> : null}
            {boards && !boards.length && isSandbox ? (
              <div className="pinterest-sandbox-board-create">
                <label className="field">
                  <span>{t("测试看板名称", "Test board name")}</span>
                  <input
                    maxLength={180}
                    onChange={(event) =>
                      setNewBoardNameByAccount((current) => ({ ...current, [account.id]: event.target.value }))
                    }
                    placeholder={t("例如：Pinterest Sandbox 录屏测试", "For example: Pinterest Sandbox recording test")}
                    value={newBoardName}
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={!newBoardName.trim() || isCreating}
                  onClick={() => {
                    void onCreateBoard(account.id, newBoardName.trim())
                      .then(() => setNewBoardNameByAccount((current) => ({ ...current, [account.id]: "" })))
                      .catch(() => undefined);
                  }}
                  type="button"
                >
                  {isCreating
                    ? t("正在创建测试看板…", "Creating test board...")
                    : t("创建 Sandbox 测试看板", "Create Sandbox test board")}
                </button>
              </div>
            ) : null}
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
