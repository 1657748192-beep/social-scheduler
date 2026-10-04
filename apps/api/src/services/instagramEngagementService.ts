import type { WorkspaceRole } from "@prisma/client";
import { config } from "../config";
import {
  canSendInstagramPrivateReply,
  createInstagramEngagementClient,
  isInstagramMessagingWindowOpen,
  type InstagramEngagementClient
} from "../integrations/social/instagramEngagement";
import {
  claimInstagramPrivateReplyAttempt,
  finishInstagramPrivateReplyAttempt,
  instagramPrivateReplyAttemptStore,
  type PrivateReplyAttemptStore
} from "./instagramPrivateReplyStateService";
import { decryptToken } from "../utils/tokenCrypto";
import { HttpError } from "../utils/errors";
import { prisma } from "../prisma";
import { requireWorkspaceMembership } from "./workspaceService";
import { instagramAccountLinkState } from "./instagramPostAccountIdentity";

type AccountRecord = {
  id: string;
  workspaceId: string;
  platform: string;
  providerAccountId: string;
  status: string;
  credential: { accessTokenEncrypted: string; scopes: string[] } | null;
};

type PublishedPostRecord = {
  id: string;
  workspaceId: string;
  status: string;
  postVariant: { id: string; platform: string; instagramProviderAccountId: string | null; socialAccountId: string | null; socialAccount: AccountRecord | null };
  publishJobs: Array<{ status: string; providerPostId: string | null; rawResponse?: unknown }>;
};

type ServicePrisma = {
  schedule: { findFirst(args: Record<string, unknown>): Promise<unknown> };
  socialAccount: { findFirst(args: Record<string, unknown>): Promise<unknown> };
  postVariant: { updateMany(args: Record<string, unknown>): Promise<{ count: number }> };
};

type ServiceDependencies = {
  prisma: ServicePrisma;
  requireWorkspaceMembership(userId: string, workspaceId: string): Promise<{ role: WorkspaceRole }>;
  createClient(input: { accessToken: string; instagramAccountId: string; apiVersion: string }): InstagramEngagementClient;
  decryptToken(value: string): string;
  privateReplyStore: PrivateReplyAttemptStore;
  now(): Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function accountRecord(value: unknown): AccountRecord | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.workspaceId !== "string" ||
      typeof value.platform !== "string" || typeof value.providerAccountId !== "string" || typeof value.status !== "string") return null;
  const rawCredential = value.credential;
  if (rawCredential === null) return { ...value, credential: null } as AccountRecord;
  if (!isRecord(rawCredential) || typeof rawCredential.accessTokenEncrypted !== "string" ||
      !Array.isArray(rawCredential.scopes) || !rawCredential.scopes.every((scope) => typeof scope === "string")) return null;
  return { ...value, credential: { accessTokenEncrypted: rawCredential.accessTokenEncrypted, scopes: rawCredential.scopes as string[] } } as AccountRecord;
}

function publishedPostRecord(value: unknown): PublishedPostRecord | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.workspaceId !== "string" ||
      typeof value.status !== "string" || !isRecord(value.postVariant) ||
      typeof value.postVariant.platform !== "string" || !Array.isArray(value.publishJobs)) return null;
  const rawAccount = value.postVariant.socialAccount;
  const account = rawAccount == null ? null : accountRecord(rawAccount);
  if (rawAccount != null && !account) return null;
  const jobs = value.publishJobs.filter(isRecord).map((job) => ({
    status: typeof job.status === "string" ? job.status : "",
    providerPostId: typeof job.providerPostId === "string" ? job.providerPostId : null,
    rawResponse: job.rawResponse
  }));
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    status: value.status,
    postVariant: {
      id: typeof value.postVariant.id === "string" ? value.postVariant.id : "",
      platform: value.postVariant.platform,
      instagramProviderAccountId: typeof value.postVariant.instagramProviderAccountId === "string" ? value.postVariant.instagramProviderAccountId : null,
      socialAccountId: typeof value.postVariant.socialAccountId === "string" ? value.postVariant.socialAccountId : null,
      socialAccount: account
    },
    publishJobs: jobs
  };
}

function hasScope(account: AccountRecord, scope: string) {
  return account.credential?.scopes.includes(scope) === true;
}

function requireScope(account: AccountRecord, ...scopes: string[]) {
  if (scopes.some((scope) => !hasScope(account, scope))) {
    throw new HttpError(403, "Instagram permission is missing. Reauthorize this account to enable the requested feature.");
  }
}

function requireCanWrite(role: WorkspaceRole) {
  if (role === "viewer") throw new HttpError(403, "Viewer role can read Instagram activity but cannot reply.");
}

function safeProviderError(error: unknown): never {
  if (error && typeof error === "object" && "kind" in error) {
    const kind = (error as { kind?: string }).kind;
    if (kind === "permission_missing") throw new HttpError(403, "Instagram permission is missing.");
    if (kind === "authorization_invalid") throw new HttpError(409, "Instagram authorization is invalid. Reconnect this account.");
    if (kind === "window_expired") throw new HttpError(400, "The Instagram reply window has expired.");
    if (kind === "rate_limited") throw new HttpError(429, "Instagram is rate limiting requests. Try again later.");
    throw new HttpError(502, "Instagram is temporarily unavailable. Try again later.");
  }
  throw error;
}

export function createInstagramEngagementService(dependencies: ServiceDependencies) {
  async function membership(userId: string, workspaceId: string, write = false) {
    const member = await dependencies.requireWorkspaceMembership(userId, workspaceId);
    if (write) requireCanWrite(member.role);
    return member;
  }

  async function accountForWorkspace(workspaceId: string, socialAccountId: string) {
    const raw = await dependencies.prisma.socialAccount.findFirst({
      where: { id: socialAccountId, workspaceId, platform: "instagram", status: "active" },
      include: { credential: { select: { accessTokenEncrypted: true, scopes: true } } }
    });
    const account = accountRecord(raw);
    if (!account?.credential || account.workspaceId !== workspaceId || account.platform !== "instagram" || account.status !== "active") {
      throw new HttpError(404, "Connected Instagram account not found");
    }
    return account;
  }

  async function publishedInstagramPost(userId: string, workspaceId: string, scheduleId: string) {
    await membership(userId, workspaceId);
    const raw = await dependencies.prisma.schedule.findFirst({
      where: { id: scheduleId, workspaceId, status: "published" },
      include: {
        postVariant: { include: { socialAccount: { include: { credential: { select: { accessTokenEncrypted: true, scopes: true } } } } } },
        publishJobs: { where: { status: "succeeded" }, orderBy: { updatedAt: "desc" }, take: 1 }
      }
    });
    const post = publishedPostRecord(raw);
    const job = post?.publishJobs[0];
    const rawResponse = job?.rawResponse;
    const simulated = isRecord(rawResponse) && rawResponse.platform === "instagram" && rawResponse.simulated === true;
    if (!post || post.id !== scheduleId || post.workspaceId !== workspaceId || post.status !== "published" ||
        post.postVariant.platform !== "instagram" || !job || job.status !== "succeeded" ||
        !job.providerPostId || simulated) {
      throw new HttpError(404, "Published Instagram post not found");
    }
    const expectedProviderAccountId = post.postVariant.instagramProviderAccountId ?? post.postVariant.socialAccount?.providerAccountId;
    if (!expectedProviderAccountId) throw new HttpError(409, "This legacy Instagram post must be linked to an account before interactions can be viewed.");
    const linkedAccount = post.postVariant.socialAccount;
    if (linkedAccount && (linkedAccount.workspaceId !== workspaceId || linkedAccount.platform !== "instagram")) {
      throw new HttpError(404, "Published Instagram post not found");
    }
    const account = linkedAccount?.workspaceId === workspaceId && linkedAccount.platform === "instagram" &&
      linkedAccount.status === "active" && linkedAccount.providerAccountId === expectedProviderAccountId
      ? linkedAccount
      : accountRecord(await dependencies.prisma.socialAccount.findFirst({
          where: { workspaceId, platform: "instagram", providerAccountId: expectedProviderAccountId, status: "active" },
          include: { credential: { select: { accessTokenEncrypted: true, scopes: true } } }
        }));
    if (!account || account.workspaceId !== workspaceId || account.platform !== "instagram" || account.status !== "active" || !account.credential) {
      throw new HttpError(409, "Instagram account is no longer connected. Reconnect it to view post activity.");
    }
    return { post, account, mediaId: job.providerPostId };
  }

  function client(account: AccountRecord): InstagramEngagementClient {
    if (!account.credential) throw new HttpError(404, "Connected Instagram account not found");
    return dependencies.createClient({
      accessToken: dependencies.decryptToken(account.credential.accessTokenEncrypted),
      instagramAccountId: account.providerAccountId,
      apiVersion: config.INSTAGRAM_GRAPH_API_VERSION
    });
  }

  async function verifiedConversation(account: AccountRecord, conversationId: string, api: InstagramEngagementClient) {
    let conversation;
    try { conversation = await api.getConversation(conversationId); } catch (error) { safeProviderError(error); }
    if (conversation.id !== conversationId || !conversation.participantIds.includes(account.providerAccountId)) {
      throw new HttpError(404, "Instagram conversation not found");
    }
    return conversation;
  }

  return {
    async recoverLegacyPostAccount(userId: string, workspaceId: string, scheduleId: string, socialAccountId: string) {
      const member = await membership(userId, workspaceId);
      if (member.role !== "owner" && member.role !== "admin") throw new HttpError(403, "Only workspace owners or admins can link a legacy Instagram post.");
      const account = await accountForWorkspace(workspaceId, socialAccountId);
      const raw = await dependencies.prisma.schedule.findFirst({
        where: { id: scheduleId, workspaceId, status: "published" },
        include: {
          postVariant: true,
          publishJobs: { where: { status: "succeeded" }, orderBy: { updatedAt: "desc" }, take: 1 }
        }
      });
      const post = publishedPostRecord(raw);
      const job = post?.publishJobs[0];
      const response = job?.rawResponse;
      const simulated = isRecord(response) && response.platform === "instagram" && response.simulated === true;
      if (!post || post.workspaceId !== workspaceId || post.status !== "published" || post.postVariant.platform !== "instagram" ||
          !job || job.status !== "succeeded" || !job.providerPostId || simulated || !post.postVariant.id) {
        throw new HttpError(404, "Published Instagram post not found");
      }
      const savedId = post.postVariant.instagramProviderAccountId;
      if (savedId) {
        if (savedId !== account.providerAccountId) throw new HttpError(409, "This post is already linked to a different Instagram account.");
        return { accountLinkState: "connected" as const };
      }
      if (post.postVariant.socialAccountId) throw new HttpError(409, "This post is still linked to its original account; refresh the page and try again.");
      requireScope(account, "instagram_business_basic");
      let verified = false;
      try { verified = await client(account).ownsMedia(job.providerPostId); } catch (error) { safeProviderError(error); }
      if (!verified) throw new HttpError(409, "Could not verify that this published post belongs to the selected Instagram account.");
      const result = await dependencies.prisma.postVariant.updateMany({
        where: { id: post.postVariant.id, platform: "instagram", instagramProviderAccountId: null, socialAccountId: null },
        data: { instagramProviderAccountId: account.providerAccountId }
      });
      if (result.count !== 1) throw new HttpError(409, "This post changed while it was being linked. Refresh and try again.");
      return { accountLinkState: "connected" as const };
    },
    async getPostMetrics(userId: string, workspaceId: string, scheduleId: string) {
      const { account, mediaId } = await publishedInstagramPost(userId, workspaceId, scheduleId);
      requireScope(account, "instagram_business_basic");
      try { return await client(account).getPostMetrics(mediaId); } catch (error) { safeProviderError(error); }
    },

    async listComments(userId: string, workspaceId: string, scheduleId: string, options?: { after?: string; limit?: number }) {
      const { account, mediaId } = await publishedInstagramPost(userId, workspaceId, scheduleId);
      requireScope(account, "instagram_business_basic", "instagram_business_manage_comments");
      try { return await client(account).listComments(mediaId, options); } catch (error) { safeProviderError(error); }
    },

    async replyToComment(userId: string, workspaceId: string, scheduleId: string, commentId: string, message: string) {
      await membership(userId, workspaceId, true);
      const { account, mediaId } = await publishedInstagramPost(userId, workspaceId, scheduleId);
      requireScope(account, "instagram_business_manage_comments");
      const api = client(account);
      let comment;
      try { comment = await api.getComment(commentId); } catch (error) { safeProviderError(error); }
      if (comment.mediaId !== mediaId) throw new HttpError(404, "Instagram comment not found on this post");
      try { return await api.replyToComment(commentId, message); } catch (error) { safeProviderError(error); }
    },

    async sendPrivateReply(userId: string, workspaceId: string, scheduleId: string, commentId: string, message: string) {
      await membership(userId, workspaceId, true);
      const { account, mediaId } = await publishedInstagramPost(userId, workspaceId, scheduleId);
      requireScope(account, "instagram_business_manage_comments", "instagram_business_manage_messages");
      const api = client(account);
      let comment;
      try { comment = await api.getComment(commentId); } catch (error) { safeProviderError(error); }
      if (comment.mediaId !== mediaId) throw new HttpError(404, "Instagram comment not found on this post");
      const commentCreatedAt = new Date(comment.timestamp);
      if (!Number.isFinite(commentCreatedAt.getTime()) || !canSendInstagramPrivateReply({ commentCreatedAt, now: dependencies.now() })) {
        throw new HttpError(400, "The Instagram private reply window has expired.");
      }
      const attempt = await claimInstagramPrivateReplyAttempt(dependencies.privateReplyStore, {
        socialAccountId: account.id,
        mediaId,
        commentId
      });
      if (!attempt.claimed) throw new HttpError(409, "A private reply was already attempted for this comment.");
      try {
        const result = await api.sendPrivateReply(commentId, message);
        await finishInstagramPrivateReplyAttempt(dependencies.privateReplyStore, {
          socialAccountId: account.id,
          mediaId,
          commentId,
          status: "sent",
          providerMessageId: result.messageId
        });
        return result;
      } catch (error) {
        await finishInstagramPrivateReplyAttempt(dependencies.privateReplyStore, {
          socialAccountId: account.id,
          mediaId,
          commentId,
          status: "failed"
        }).catch(() => false);
        safeProviderError(error);
      }
    },

    async listConversations(userId: string, workspaceId: string, socialAccountId: string, options?: { after?: string; limit?: number }) {
      await membership(userId, workspaceId);
      const account = await accountForWorkspace(workspaceId, socialAccountId);
      requireScope(account, "instagram_business_manage_messages");
      try { return await client(account).listConversations(options); } catch (error) { safeProviderError(error); }
    },

    async listMessages(userId: string, workspaceId: string, socialAccountId: string, conversationId: string, options?: { after?: string; limit?: number }) {
      await membership(userId, workspaceId);
      const account = await accountForWorkspace(workspaceId, socialAccountId);
      requireScope(account, "instagram_business_manage_messages");
      const api = client(account);
      await verifiedConversation(account, conversationId, api);
      try { return await api.listMessages(conversationId, options); } catch (error) { safeProviderError(error); }
    },

    async replyToConversation(userId: string, workspaceId: string, socialAccountId: string, conversationId: string, message: string) {
      await membership(userId, workspaceId, true);
      const account = await accountForWorkspace(workspaceId, socialAccountId);
      requireScope(account, "instagram_business_manage_messages");
      const api = client(account);
      const conversation = await verifiedConversation(account, conversationId, api);
      let messages;
      try { messages = await api.listMessages(conversationId, { limit: 50 }); } catch (error) { safeProviderError(error); }
      const inbound = messages.items
        .filter((item) => isRecord(item) && isRecord(item.from) && item.from.id !== account.providerAccountId)
        .map((item) => ({
          fromId: (item as Record<string, unknown>).from && ((item as Record<string, unknown>).from as Record<string, unknown>).id,
          time: new Date(String((item as Record<string, unknown>).created_time ?? ""))
        }))
        .filter((item) => typeof item.fromId === "string" && Number.isFinite(item.time.getTime()))
        .sort((a, b) => b.time.getTime() - a.time.getTime())[0];
      if (!inbound || !isInstagramMessagingWindowOpen(inbound.time, dependencies.now())) {
        throw new HttpError(400, "The Instagram 24-hour messaging window has expired.");
      }
      const recipientId = conversation.participantIds.find((id) => id !== account.providerAccountId);
      if (!recipientId || recipientId !== inbound.fromId) throw new HttpError(404, "Instagram conversation participant not found");
      try { return await api.sendMessage(recipientId, message); } catch (error) { safeProviderError(error); }
    }
  };
}

const productionDependencies: ServiceDependencies = {
  prisma: prisma as unknown as ServicePrisma,
  requireWorkspaceMembership,
  createClient: createInstagramEngagementClient,
  decryptToken,
  privateReplyStore: instagramPrivateReplyAttemptStore,
  now: () => new Date()
};

export const instagramEngagementService = createInstagramEngagementService(productionDependencies);
