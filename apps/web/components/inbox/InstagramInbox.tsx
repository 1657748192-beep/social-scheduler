"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiRequest,
  type InstagramConnection,
  type InstagramConversation,
  type InstagramMessage,
  type SocialAccount,
  type Workspace
} from "../../lib/api";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "../../lib/activeWorkspace";
import { useLanguage } from "../LanguageProvider";

type InstagramInboxProps = { token: string; workspaces: Workspace[] };

function inboxErrorMessage(error: unknown, t: (chinese: string, english: string) => string) {
  const message = error instanceof Error ? error.message : "";
  if (/permission is missing|permission_missing/i.test(message)) return t("缺少 Instagram 消息权限；重新授权不会影响发布功能。", "Instagram messaging permission is missing. Reauthorization will not affect publishing.");
  if (/authorization is invalid|authorization_invalid/i.test(message)) return t("Instagram 授权已失效，请重新连接账号。", "Instagram authorization is invalid. Reconnect the account.");
  if (/window has expired|window.*expired|24-hour/i.test(message)) return t("超过 24 小时回复窗口，无法发送消息。", "The 24-hour messaging window has expired.");
  if (/rate limit/i.test(message)) return t("Instagram 请求过于频繁，请稍后重试。", "Instagram is rate limiting requests. Try again later.");
  if (message) return message;
  return t("Instagram 暂时不可用，请稍后重试。", "Instagram is temporarily unavailable. Try again later.");
}

function timestamp(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "";
}

export function InstagramInbox({ token, workspaces }: InstagramInboxProps) {
  const { t } = useLanguage();
  const [workspaceId, setWorkspaceId] = useState("");
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [conversations, setConversations] = useState<InstagramConversation[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<InstagramMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const activeInstagramAccounts = useMemo(
    () => accounts.filter((account) => account.platform === "instagram" && account.status !== "disconnected"),
    [accounts]
  );
  const hasMessagePermission = selectedAccount?.status === "active" && selectedAccount.credential?.scopes.includes("instagram_business_manage_messages") === true;
  const canManage = selectedWorkspace?.role === "owner" || selectedWorkspace?.role === "admin";
  const isViewer = selectedWorkspace?.role === "viewer";

  useEffect(() => {
    const activeWorkspaceId = getActiveWorkspaceId(workspaces, workspaceId);
    setWorkspaceId(activeWorkspaceId);
  }, [workspaces]);

  const loadAccounts = useCallback(async () => {
    if (!workspaceId) { setAccounts([]); setAccountId(""); return; }
    setLoadingAccounts(true);
    setError(null);
    try {
      const result = await apiRequest<SocialAccount[]>(`/workspaces/${encodeURIComponent(workspaceId)}/social-accounts`, { token });
      const nextAccounts = result.filter((account) => account.platform === "instagram" && account.status === "active");
      setAccounts(nextAccounts);
      setAccountId((current) => nextAccounts.some((account) => account.id === current) ? current : nextAccounts[0]?.id ?? "");
    } catch (requestError) {
      setAccounts([]);
      setError(inboxErrorMessage(requestError, t));
    } finally {
      setLoadingAccounts(false);
    }
  }, [token, workspaceId, t]);

  const loadConversations = useCallback(async () => {
    if (!workspaceId || !accountId) { setConversations([]); setConversationId(""); return; }
    setLoadingConversations(true);
    setError(null);
    try {
      const result = await apiRequest<InstagramConnection<InstagramConversation>>(
        `/workspaces/${encodeURIComponent(workspaceId)}/social-accounts/${encodeURIComponent(accountId)}/instagram/conversations?limit=25`,
        { token }
      );
      setConversations(result.items);
      setConversationId((current) => result.items.some((conversation) => conversation.id === current) ? current : result.items[0]?.id ?? "");
    } catch (requestError) {
      setConversations([]);
      setConversationId("");
      setError(inboxErrorMessage(requestError, t));
    } finally {
      setLoadingConversations(false);
    }
  }, [accountId, token, workspaceId, t]);

  const loadMessages = useCallback(async () => {
    if (!workspaceId || !accountId || !conversationId) { setMessages([]); return; }
    setLoadingMessages(true);
    setError(null);
    try {
      const result = await apiRequest<InstagramConnection<InstagramMessage>>(
        `/workspaces/${encodeURIComponent(workspaceId)}/social-accounts/${encodeURIComponent(accountId)}/instagram/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`,
        { token }
      );
      setMessages(result.items);
    } catch (requestError) {
      setMessages([]);
      setError(inboxErrorMessage(requestError, t));
    } finally {
      setLoadingMessages(false);
    }
  }, [accountId, conversationId, token, workspaceId, t]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);
  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => { void loadMessages(); }, [loadMessages]);

  const latestInbound = [...messages]
    .filter((message) => message.from?.id && message.from.id !== selectedAccount?.providerAccountId)
    .map((message) => new Date(message.created_time ?? ""))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const withinReplyWindow = Boolean(latestInbound && Date.now() - latestInbound.getTime() <= 24 * 60 * 60 * 1000);
  const canSend = hasMessagePermission && !isViewer && withinReplyWindow && Boolean(draft.trim()) && !sending;

  async function refreshAll() {
    await loadConversations();
    await loadMessages();
  }

  async function reauthorize() {
    if (!selectedAccount || !canManage) return;
    try {
      const result = selectedAccount.status === "active"
        ? await apiRequest<{ authorizationUrl: string }>(
            `/workspaces/${encodeURIComponent(workspaceId)}/social-accounts/${encodeURIComponent(selectedAccount.id)}/instagram-engagement/oauth/start`,
            { method: "POST", token }
          )
        : await apiRequest<{ authorizationUrl: string }>(`/integrations/instagram/oauth/start?workspaceId=${encodeURIComponent(workspaceId)}`, { token });
      window.location.assign(result.authorizationUrl);
    } catch (requestError) {
      setError(inboxErrorMessage(requestError, t));
    }
  }

  async function sendReply() {
    if (!canSend || !selectedAccount) return;
    setSending(true);
    setError(null);
    try {
      await apiRequest(
        `/workspaces/${encodeURIComponent(workspaceId)}/social-accounts/${encodeURIComponent(selectedAccount.id)}/instagram/conversations/${encodeURIComponent(conversationId)}/replies`,
        { method: "POST", token, body: { message: draft.trim() } }
      );
      setDraft("");
      await loadMessages();
    } catch (requestError) {
      setError(inboxErrorMessage(requestError, t));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="instagram-inbox panel">
      <header className="instagram-inbox-header">
        <div className="instagram-inbox-actions">
          <p className="section-kicker">Instagram</p>
          <h2>{t("Instagram 收件箱", "Instagram inbox")}</h2>
          <p className="muted">{t("查看会话，并由团队成员逐条手动回复。", "Review conversations and have a team member reply manually, one message at a time.")}</p>
        </div>
        <div>
          {selectedAccount && canManage ? (
            <button className="button secondary" onClick={() => void reauthorize()} type="button">
              {t("重新授权 Instagram", "Reauthorize Instagram")}
            </button>
          ) : null}
          <button className="button secondary" disabled={loadingAccounts || loadingConversations || loadingMessages} onClick={() => void refreshAll()} type="button">
            {t("刷新", "Refresh")}
          </button>
        </div>
      </header>
      <div className="instagram-inbox-filters">
        <label className="field">
          <span>{t("工作区", "Workspace")}</span>
          <select onChange={(event) => { setActiveWorkspaceId(event.target.value); setWorkspaceId(event.target.value); }} value={workspaceId}>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("Instagram 账号", "Instagram account")}</span>
          <select onChange={(event) => setAccountId(event.target.value)} value={accountId}>
            {activeInstagramAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}
          </select>
        </label>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {selectedAccount?.capabilities.instagramEngagement?.webhookConfigured === false ? (
        <p className="instagram-notice">{t("Webhook 未配置，实时消息通知不可用；可手动刷新收件箱。", "Webhook is not configured, so live message notifications are unavailable. You can refresh the inbox manually.")}</p>
      ) : null}
      {selectedAccount && !hasMessagePermission ? (
        <div className="instagram-notice">
          <span>{t("Instagram 消息权限待开通或需要重新授权；原有发帖功能不受影响。", "Instagram messaging permission is pending or needs reauthorization; publishing is unaffected.")}</span>
        </div>
      ) : null}
      {selectedAccount && selectedAccount.status !== "active" ? (
        <p className="instagram-notice">{t("账号授权当前不可用。重新连接账号后，才可使用消息功能；现有发布记录仍保留。", "This account authorization is unavailable. Reconnect it to use messaging; existing publishing records remain intact.")}</p>
      ) : null}
      {!activeInstagramAccounts.length && !loadingAccounts ? (
        <p className="muted">{t("当前工作区没有已连接的 Instagram 账号。", "There are no connected Instagram accounts in this workspace.")}</p>
      ) : null}
      <div className="instagram-inbox-layout">
        <aside className="instagram-conversation-list" aria-label={t("会话列表", "Conversations")}>
          {loadingConversations && !conversations.length ? <p className="muted">{t("正在读取会话…", "Loading conversations...")}</p> : null}
          {!loadingConversations && !conversations.length && hasMessagePermission ? <p className="muted">{t("暂无会话。新消息到达后刷新查看。", "No conversations yet. Refresh after a new message arrives.")}</p> : null}
          {conversations.map((conversation) => {
            const participant = conversation.participants?.data?.find((item) => item.id !== selectedAccount?.providerAccountId);
            return (
              <button
                aria-current={conversationId === conversation.id ? "true" : undefined}
                className={conversationId === conversation.id ? "instagram-conversation active" : "instagram-conversation"}
                key={conversation.id}
                onClick={() => setConversationId(conversation.id)}
                type="button"
              >
                <strong>{participant?.username ? `@${participant.username}` : participant?.id || t("Instagram 会话", "Instagram conversation")}</strong>
                <span>{timestamp(conversation.updated_time)}</span>
              </button>
            );
          })}
        </aside>
        <div className="instagram-conversation-detail">
          <div className="instagram-message-list" aria-live="polite">
            {loadingMessages && !messages.length ? <p className="muted">{t("正在读取消息…", "Loading messages...")}</p> : null}
            {messages.map((message) => {
              const isOwn = message.from?.id === selectedAccount?.providerAccountId;
              return (
                <article className={isOwn ? "instagram-message own" : "instagram-message"} key={message.id}>
                  <strong>{isOwn ? selectedAccount?.displayName : message.from?.username || t("客户", "Customer")}</strong>
                  <p>{message.message}</p>
                  <time dateTime={message.created_time}>{timestamp(message.created_time)}</time>
                </article>
              );
            })}
            {conversationId && !loadingMessages && !messages.length ? <p className="muted">{t("此会话暂无消息。", "No messages in this conversation.")}</p> : null}
          </div>
          <div className="instagram-inbox-reply">
            {isViewer ? <p className="muted">{t("当前角色仅可查看消息，不能回复。", "Your viewer role can read messages but cannot reply.")}</p> : null}
            {!withinReplyWindow && conversationId && messages.length ? <p className="muted">{t("已超过 24 小时消息回复窗口。", "The 24-hour messaging window has expired.")}</p> : null}
            <label className="field">
              <span>{t("回复", "Reply")}</span>
              <textarea maxLength={2000} onChange={(event) => setDraft(event.target.value)} value={draft} />
            </label>
            <button className="button" disabled={!canSend} onClick={() => void sendReply()} type="button">
              {sending ? t("正在发送…", "Sending...") : t("发送", "Send")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
