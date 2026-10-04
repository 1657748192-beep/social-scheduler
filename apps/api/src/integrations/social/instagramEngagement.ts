const instagramGraphHost = "https://graph.instagram.com";
const requestTimeoutMs = 15_000;
const privateReplyWindowMs = 7 * 24 * 60 * 60 * 1000;
const messageReplyWindowMs = 24 * 60 * 60 * 1000;

export type InstagramEngagementFailureKind =
  | "permission_missing"
  | "authorization_invalid"
  | "window_expired"
  | "rate_limited"
  | "temporary_failure"
  | "request_failed";

type MetaGraphError = {
  code?: number | string;
  error_subcode?: number | string;
  message?: string;
};

export class InstagramEngagementApiError extends Error {
  constructor(readonly kind: InstagramEngagementFailureKind, status?: number) {
    super(errorMessage(kind, status));
    this.name = "InstagramEngagementApiError";
  }
}

function errorMessage(kind: InstagramEngagementFailureKind, status?: number) {
  switch (kind) {
    case "permission_missing": return "Instagram permission is missing.";
    case "authorization_invalid": return "Instagram authorization is invalid.";
    case "window_expired": return "The Instagram reply window has expired.";
    case "rate_limited": return "Instagram is rate limiting requests. Try again later.";
    case "temporary_failure": return "Instagram is temporarily unavailable.";
    default: return `Instagram request failed${status ? ` (${status})` : ""}.`;
  }
}

export function classifyInstagramEngagementFailure(status: number, error: MetaGraphError): InstagramEngagementFailureKind {
  const code = String(error.code ?? "");
  const message = error.message ?? "";

  if (/\b(?:7\s*days?|seven days?|reply window|messaging window)\b|window (?:has )?(?:expired|closed)/i.test(message)) {
    return "window_expired";
  }
  if (status === 429 || code === "4" || code === "17" || code === "613") {
    return "rate_limited";
  }
  if (status === 401 || code === "190") {
    return "authorization_invalid";
  }
  if (status === 403 || code === "10" || code === "200") {
    return "permission_missing";
  }
  if (status >= 500 || status === 408) {
    return "temporary_failure";
  }
  return "request_failed";
}

export function canSendInstagramPrivateReply(input: {
  commentCreatedAt: Date;
  isLiveComment?: boolean;
  liveIsActive?: boolean;
  now?: Date;
}) {
  if (input.isLiveComment) return input.liveIsActive === true;
  const now = input.now ?? new Date();
  const ageMs = now.getTime() - input.commentCreatedAt.getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= privateReplyWindowMs;
}

export function isInstagramMessagingWindowOpen(lastInboundMessageAt: Date, now = new Date()) {
  const ageMs = now.getTime() - lastInboundMessageAt.getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= messageReplyWindowMs;
}

type GraphConnection<T> = {
  data?: T[];
  paging?: { cursors?: { after?: string } };
};

type InstagramGraphResponse = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredId(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new InstagramEngagementApiError("request_failed");
  return value;
}

function connection<T>(payload: unknown): { items: T[]; nextCursor: string | null } {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new InstagramEngagementApiError("request_failed");
  }
  const paging = isRecord(payload.paging) ? payload.paging : undefined;
  const cursors = paging && isRecord(paging.cursors) ? paging.cursors : undefined;
  const after = cursors?.after;
  return {
    items: payload.data as T[],
    nextCursor: typeof after === "string" && after ? after : null
  };
}

export type InstagramEngagementClient = ReturnType<typeof createInstagramEngagementClient>;

export function createInstagramEngagementClient(input: {
  accessToken: string;
  instagramAccountId: string;
  apiVersion: string;
  fetcher?: typeof fetch;
}) {
  const accountId = requiredId(input.instagramAccountId, "instagramAccountId");
  if (!input.accessToken) throw new Error("Instagram access token is required.");
  if (!/^v\d+\.\d+$/.test(input.apiVersion)) throw new Error("Instagram Graph API version is invalid.");
  const fetcher = input.fetcher ?? fetch;

  async function request<T extends InstagramGraphResponse>(
    path: string,
    options: { method?: "GET" | "POST"; query?: Record<string, string | number | undefined>; body?: URLSearchParams | Record<string, unknown> } = {}
  ): Promise<T> {
    const url = new URL(`${input.apiVersion}/${path.split("/").map(encodeURIComponent).join("/")}`, `${instagramGraphHost}/`);
    Object.entries(options.query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
    const isForm = options.body instanceof URLSearchParams;
    let body: string | undefined;
    if (options.body) body = isForm ? String(options.body) : JSON.stringify(options.body);

    let response: Response;
    try {
      response = await fetcher(url, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          ...(body ? { "Content-Type": isForm ? "application/x-www-form-urlencoded" : "application/json" } : {})
        },
        body,
        signal: AbortSignal.timeout(requestTimeoutMs)
      });
    } catch {
      throw new InstagramEngagementApiError("temporary_failure");
    }

    const payload: unknown = await response.json().catch(() => null);
    const providerError = isRecord(payload) && isRecord(payload.error) ? payload.error as MetaGraphError : undefined;
    if (!response.ok || providerError) {
      const kind = classifyInstagramEngagementFailure(response.status, providerError ?? {});
      throw new InstagramEngagementApiError(kind, response.status);
    }
    if (!isRecord(payload)) throw new InstagramEngagementApiError("request_failed", response.status);
    return payload as T;
  }

  function pageQuery(options?: { after?: string; limit?: number }) {
    const limit = options?.limit === undefined ? 25 : Math.min(50, Math.max(1, Math.floor(options.limit)));
    return { limit, after: options?.after };
  }

  return {
    async getPostMetrics(mediaId: string) {
      const payload = await request<{ id?: string; like_count?: number; comments_count?: number }>(
        requiredId(mediaId, "mediaId"),
        { query: { fields: "like_count,comments_count" } }
      );
      if (!Number.isFinite(payload.like_count) || !Number.isFinite(payload.comments_count)) {
        throw new InstagramEngagementApiError("request_failed");
      }
      return { likeCount: payload.like_count as number, commentCount: payload.comments_count as number };
    },

    async listComments(mediaId: string, options?: { after?: string; limit?: number }) {
      const payload = await request<GraphConnection<Record<string, unknown>>>(
        `${requiredId(mediaId, "mediaId")}/comments`,
        { query: { fields: "id,text,username,timestamp,from", ...pageQuery(options) } }
      );
      return connection(payload);
    },

    async getComment(commentId: string) {
      const payload = await request<{ id?: string; media?: string | { id?: string }; timestamp?: string }>(
        requiredId(commentId, "commentId"),
        { query: { fields: "id,media,timestamp" } }
      );
      const mediaId = typeof payload.media === "string"
        ? payload.media
        : payload.media && typeof payload.media.id === "string"
          ? payload.media.id
          : undefined;
      return {
        id: requiredId(payload.id, "id"),
        mediaId: requiredId(mediaId, "mediaId"),
        timestamp: typeof payload.timestamp === "string" ? payload.timestamp : ""
      };
    },

    async replyToComment(commentId: string, message: string) {
      const payload = await request<{ id?: string }>(
        `${requiredId(commentId, "commentId")}/replies`,
        { method: "POST", body: new URLSearchParams({ message }) }
      );
      return { id: requiredId(payload.id, "id") };
    },

    async sendPrivateReply(commentId: string, message: string) {
      const payload = await request<{ message_id?: string }>(`${accountId}/messages`, {
        method: "POST",
        body: { recipient: { comment_id: requiredId(commentId, "commentId") }, message: { text: message } }
      });
      return { messageId: requiredId(payload.message_id, "message_id") };
    },

    async listConversations(options?: { after?: string; limit?: number }) {
      const payload = await request<GraphConnection<Record<string, unknown>>>(`${accountId}/conversations`, {
        query: { platform: "instagram", fields: "id,updated_time,participants", ...pageQuery(options) }
      });
      return connection(payload);
    },

    async getConversation(conversationId: string) {
      const payload = await request<{ id?: string; participants?: { data?: Array<{ id?: string }> } | Array<{ id?: string }> }>(
        requiredId(conversationId, "conversationId"),
        { query: { fields: "id,participants" } }
      );
      const participants = Array.isArray(payload.participants)
        ? payload.participants
        : payload.participants?.data ?? [];
      return {
        id: requiredId(payload.id, "id"),
        participantIds: participants
          .map((participant) => participant.id)
          .filter((id): id is string => typeof id === "string" && Boolean(id))
      };
    },

    async listMessages(conversationId: string, options?: { after?: string; limit?: number }) {
      const payload = await request<{ data?: Record<string, unknown>[]; paging?: GraphConnection<unknown>["paging"]; messages?: unknown }>(
        requiredId(conversationId, "conversationId"),
        { query: { fields: "messages{id,message,created_time,from,to}", ...pageQuery(options) } }
      );
      return connection(payload.messages ?? payload);
    },

    async sendMessage(recipientId: string, message: string) {
      const payload = await request<{ message_id?: string }>(`${accountId}/messages`, {
        method: "POST",
        body: { recipient: { id: requiredId(recipientId, "recipientId") }, message: { text: message } }
      });
      return { messageId: requiredId(payload.message_id, "message_id") };
    }
  };
}
