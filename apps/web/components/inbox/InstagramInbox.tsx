"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createReceptionPoller, instagramInboxReadNotice, type InstagramReceptionStatus, type InstagramReadMetadata } from "../../lib/instagramReception";
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
  const [reception, setReception] = useState<InstagramReceptionStatus | null>(null);
  const [readMeta, setReadMeta] = useState<InstagramReadMetadata | null>(null);
  const [messageMeta, setMessageMeta] = useState<InstagramReadMetadata | null>(null);
  const [conversationCursor, setConversationCursor] = useState<string | null>(null);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [latestInboundAt, setLatestInboundAt] = useState<string | null>(null);
  const context = useRef({ workspaceId, accountId, conversationId });
  context.current = { workspaceId, accountId, conversationId };
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
      if (context.current.workspaceId !== workspaceId) return;
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
      if (context.current.workspaceId !== workspaceId || context.current.accountId !== accountId) return;
      setReadMeta(result);
      setConversationCursor(result.nextCursor);
      setConversations(result.items);
      setConversationId((current) => result.items.some((conversation) => conversation.id === current) ? current : result.items[0]?.id ?? "");
      return true;
    } catch (requestError) {
      if (context.current.workspaceId !== workspaceId || context.current.accountId !== accountId) return;
      setConversations([]);
      setConversationId("");
      setError(inboxErrorMessage(requestError, t));
      return false;
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
      if (context.current.workspaceId !== workspaceId || context.current.accountId !== accountId || context.current.conversationId !== conversationId) return;
      setMessageMeta(result); setMessageCursor(result.nextCursor); setLatestInboundAt(result.latestInboundAt ?? null);
      setMessages(result.items);
      return true;
    } catch (requestError) {
      if (context.current.workspaceId !== workspaceId || context.current.accountId !== accountId || context.current.conversationId !== conversationId) return;
      setMessages([]);
      setError(inboxErrorMessage(requestError, t));
      return false;
    } finally {
      setLoadingMessages(false);
    }
  }, [accountId, conversationId, token, workspaceId, t]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);
  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => { void loadMessages(); }, [loadMessages]);
  useEffect(() => {
    setReception(null);
    if (!workspaceId || !accountId) return;
    let alive = true;
    const readStatus = async () => {
      const result = await apiRequest<InstagramReceptionStatus>(`/workspaces/${encodeURIComponent(workspaceId)}/social-accounts/${encodeURIComponent(accountId)}/instagram/reception`, { token });
      if (alive) setReception(result);
      return result;
    };
    void readStatus().catch(() => { if (alive) setReception(null); });
    const poller = createReceptionPoller({ readStatus, onRevision: async () => { if (alive) {
      const conversationsLoaded = await loadConversations();
      const messagesLoaded = conversationId ? await loadMessages() : true;
      if (!conversationsLoaded || !messagesLoaded) throw new Error("Inbox refresh failed");
    } }, intervalMs: 15000, isVisible: () => document.visibilityState === "visible" });
    return () => { alive = false; poller.stop(); };
  }, [workspaceId, accountId, token, loadConversations, loadMessages]);
  useEffect(() => { setReadMeta(null); setMessageMeta(null); setLatestInboundAt(null); setMessages([]); setDraft(""); }, [workspaceId, accountId]);
  useEffect(() => { setMessageMeta(null); setLatestInboundAt(null); setMessageCursor(null); }, [conversationId]);

  const latestInbound = [...messages]
    .filter((message) => message.inbound !== false && message.from?.id && message.from.id !== selectedAccount?.providerAccountId)
    .map((message) => new Date(message.created_time ?? ""))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const receivedInbound = latestInboundAt ? new Date(latestInboundAt) : undefined;
  const authoritativeInbound = receivedInbound && (!latestInbound || receivedInbound > latestInbound) ? receivedInbound : latestInbound;
  const withinReplyWindow = Boolean(authoritativeInbound && Date.now() >= authoritativeInbound.getTime() && Date.now() - authoritativeInbound.getTime() <= 24 * 60 * 60 * 1000);
  async function loadOlder(kind: "conversations" | "messages") {
    const cursor = kind === "conversations" ? conversationCursor : messageCursor;
    if (!cursor) return;
    const requested = { workspaceId, accountId, conversationId };
    try {
      const path = `/workspaces/${encodeURIComponent(workspaceId)}/social-accounts/${encodeURIComponent(accountId)}/instagram/conversations${kind === "messages" ? `/${encodeURIComponent(conversationId)}/messages` : ""}`;
      const result = await apiRequest<InstagramConnection<InstagramConversation & InstagramMessage>>(`${path}?after=${encodeURIComponent(cursor)}&limit=25`, { token });
      if (context.current.workspaceId !== requested.workspaceId || context.current.accountId !== requested.accountId || context.current.conversationId !== requested.conversationId) return;
      if (kind === "conversations") { setConversations(current => [...new Map([...current, ...result.items].map(item => [item.id, item])).values()]); setConversationCursor(result.nextCursor); }
      else { setMessages(current => [...new Map([...current, ...result.items].map(item => [item.id, item])).values()]); setMessageCursor(result.nextCursor); setMessageMeta(result); }
    } catch (requestError) { setError(inboxErrorMessage(requestError, t)); }
  }
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
      const result = await apiRequest<{ localSaveStatus?: string }>(
        `/workspaces/${encodeURIComponent(workspaceId)}/social-accounts/${encodeURIComponent(selectedAccount.id)}/instagram/conversations/${encodeURIComponent(conversationId)}/replies`,
        { method: "POST", token, body: { message: draft.trim() } }
      );
      setDraft("");
      await loadMessages();
      if (result.localSaveStatus === "failed") setError(t("消息已发送，但本地保存失败；请勿重复发送，等待回执同步。", "Message sent, but local save failed. Do not resend; wait for the delivery echo."));
    } catch (requestError) {
      setError(inboxErrorMessage(requestError, t));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="instagram-inbox panel">
      <header className="instagram-inbox-header">
        <div>
          <p className="section-kicker">Instagram</p>
          <h2>{t("Instagram 收件箱", "Instagram inbox")}</h2>
          <p className="muted">{t("查看会话，并由团队成员逐条手动回复。", "Review conversations and have a team member reply manually, one message at a time.")}</p>
        </div>
        <div className="instagram-inbox-actions">
          {selectedAccount && canManage ? (
            <button className="button secondary" onClick={() => void reauthorize()} type="button">
              {hasMessagePermission
                ? t("更新授权（可选）", "Update authorization (optional)")
                : t("重新授权 Instagram", "Reauthorize Instagram")}
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
        <p className="instagram-notice">{t("Meta 回调及应用发布状态尚未验证；服务器配置不代表消息已接通。", "Meta callback and publication status are not verified; server configuration does not prove message delivery.")}</p>
      ) : null}
      {reception ? <p className="muted">{reception.serverReady ? t("服务器接收端就绪", "Server receiver ready") : t("服务器接收端未配置", "Server receiver not configured")} · {t("账号订阅", "Account subscription")}: {reception.subscriptionStatus === "verified" ? reception.subscribedFields.join(", ") || t("无", "none") : t("未验证", "not verified")} · {t("最近收到事件", "Last event received")}: {timestamp(reception.lastReceivedAt ?? undefined) || t("尚未收到", "none yet")}</p> : null}
      {instagramInboxReadNotice(readMeta, messageMeta) ? <p className="instagram-notice">{t("Meta 读取失败；当前展示已接收的消息，不代表历史会话同步完成。", "Meta read failed. Showing received messages; historical sync is not complete.")}</p> : null}
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
          {!loadingConversations && !conversations.length && hasMessagePermission ? <p className="muted">{t("尚未取得会话数据；这不代表 Instagram 没有私信。", "No conversation data received; this does not mean Instagram has no messages.")}</p> : null}
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
                {conversation.source === "received" ? <span>{t("已接收", "Received")}</span> : null}
              </button>
            );
          })}
          {conversationCursor ? <button className="button secondary" onClick={() => void loadOlder("conversations")}>{t("更多会话", "More conversations")}</button> : null}
        </aside>
        <div className="instagram-conversation-detail">
          <div className="instagram-message-list" aria-live="polite">
            {loadingMessages && !messages.length ? <p className="muted">{t("正在读取消息…", "Loading messages...")}</p> : null}
            {[...messages].sort((a, b) => new Date(a.created_time ?? "").getTime() - new Date(b.created_time ?? "").getTime()).map((message) => {
              const isOwn = message.from?.id === selectedAccount?.providerAccountId;
              return (
                <article className={isOwn ? "instagram-message own" : "instagram-message"} key={message.id}>
                  <strong>{isOwn ? selectedAccount?.displayName : message.from?.username || t("客户", "Customer")}</strong>
                  <p>{message.message}</p>
                  <time dateTime={message.created_time}>{timestamp(message.created_time)}</time>
                  {message.source === "received" ? <small>{t("已接收", "Received")} · {timestamp(message.receivedAt)}</small> : null}
                </article>
              );
            })}
            {messageCursor ? <button className="button secondary" onClick={() => void loadOlder("messages")}>{t("更早消息", "Older messages")}</button> : null}
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
