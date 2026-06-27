const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

type ApiOptions = {
  token?: string | null;
  method?: string;
  body?: unknown;
};

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? "请求失败");
  }

  return payload as T;
}

export async function apiUpload<T>(path: string, token: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? "上传失败");
  }

  return payload as T;
}

export type AuthResponse = {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  plan: string;
  role: "owner" | "admin" | "editor" | "viewer";
};

export type WorkspaceMember = {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "editor" | "viewer";
  status: "active" | "invited" | "disabled";
  createdAt: string;
};

export type WorkspaceInvitation = {
  id: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
  inviteUrl?: string;
  token?: string;
};

export type SocialAccount = {
  id: string;
  platform: "x" | "facebook" | "instagram";
  providerAccountId: string;
  displayName: string;
  avatarUrl?: string;
  accountType?: string;
  status: "active" | "disconnected" | "token_expired";
  capabilities: unknown;
  createdAt: string;
  credential?: {
    scopes: string[];
    expiresAt?: string;
    updatedAt: string;
  };
};

export type OAuthStartResponse = {
  authorizationUrl: string;
  state: string;
  platform: string;
};

export type OAuthProviderStatus = {
  platform: "x" | "facebook" | "instagram";
  platformParam: "twitter" | "facebook" | "instagram";
  displayName: string;
  configured: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  clientSecretRequired: boolean;
  redirectUri: string;
  developerUrl: string;
  docsUrl: string;
  requiredEnv: string[];
  scopes: string[];
};

export type ComposerPlatform = "x" | "instagram" | "facebook";

export type PlatformLimit = {
  platform: ComposerPlatform;
  label: string;
  maxTextLength: number;
  maxImages: number;
};

export type MediaAsset = {
  id: string;
  workspaceId: string;
  fileUrl: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type ComposerPost = {
  id: string;
  title?: string;
  baseText: string;
  workflowStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type CalendarSchedule = {
  id: string;
  workspaceId: string;
  postVariantId: string;
  scheduledAt: string;
  timezone: string;
  status: "scheduled" | "locked" | "published" | "failed" | "canceled";
  postVariant: {
    id: string;
    platform: "x" | "instagram" | "facebook" | "tiktok";
    text: string;
    publishStatus: string;
    post: {
      id: string;
      title?: string;
      baseText: string;
      workflowStatus: string;
    };
    media: Array<{
      id: string;
      sortOrder: number;
      mediaAsset: MediaAsset;
    }>;
  };
  publishJobs: Array<{
    id: string;
    status: "waiting" | "active" | "succeeded" | "retrying" | "failed" | "dead";
    attempts: number;
    maxAttempts: number;
    providerPermalink?: string;
    lastError?: string;
    updatedAt: string;
  }>;
};
