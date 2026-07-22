export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

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

type UploadOptions = {
  onProgress?: (progress: { loaded: number; total: number; percent: number }) => void;
};

export function apiUpload<T>(
  path: string,
  token: string,
  formData: FormData,
  options: UploadOptions = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE_URL}${path}`);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.timeout = 30 * 60 * 1000;

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      options.onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent: Math.min(100, Math.round((event.loaded / event.total) * 100))
      });
    };

    request.onload = () => {
      let payload: { message?: string } | null = null;

      try {
        payload = JSON.parse(request.responseText || "null") as { message?: string } | null;
      } catch {
        payload = null;
      }

      if (request.status >= 200 && request.status < 300) {
        resolve(payload as T);
        return;
      }

      reject(new Error(payload?.message ?? `上传失败（HTTP ${request.status}）`));
    };

    request.onerror = () => reject(new Error("网络连接中断，请检查网络后重试"));
    request.onabort = () => reject(new Error("上传已取消"));
    request.ontimeout = () => reject(new Error("上传超时，请压缩文件或稍后重试"));
    request.send(formData);
  });
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

export type PasswordResetRequestResponse = {
  ok: true;
  resetUrl?: string;
};

export type PasswordResetConfirmResponse = {
  ok: true;
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

export type AdminUsersResponse = {
  generatedAt: string;
  users: AdminUser[];
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  password: {
    storedAs: "bcrypt_hash";
    viewable: false;
    note: string;
  };
  sessionSummary: {
    totalSessions: number;
    activeSessions: number;
    latestSessionCreatedAt?: string | null;
    latestSessionExpiresAt?: string | null;
    latestSessionRevokedAt?: string | null;
  };
  stats: {
    workspaceMemberships: number;
    authoredPosts: number;
    uploadedMedia: number;
  };
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    role: "owner" | "admin" | "editor" | "viewer";
    status: "active" | "invited" | "disabled";
    plan: string;
    joinedAt: string;
    memberCount: number;
    postCount: number;
    socialAccountCount: number;
    socialAccounts: Array<{
      id: string;
      platform: "x" | "facebook" | "instagram" | "tiktok" | "linkedin" | "youtube" | "pinterest";
      displayName: string;
      accountType?: string | null;
      status: "active" | "disconnected" | "token_expired";
      createdAt: string;
    }>;
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
  platform: "x" | "facebook" | "instagram" | "tiktok" | "linkedin" | "youtube" | "pinterest";
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

export type OAuthAuthorizationLink = {
  id: string;
  platform: "x" | "facebook" | "instagram" | "tiktok" | "linkedin" | "youtube" | "pinterest";
  platformParam:
    | "twitter"
    | "facebook"
    | "instagram"
    | "tiktok"
    | "linkedin"
    | "youtube"
    | "pinterest";
  displayName: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  expiresAt: string;
  expired?: boolean;
  shareUrl?: string;
  startUrl: string;
};

export type OAuthProviderStatus = {
  platform: "x" | "facebook" | "instagram" | "tiktok" | "linkedin" | "youtube" | "pinterest";
  platformParam:
    | "twitter"
    | "facebook"
    | "instagram"
    | "tiktok"
    | "linkedin"
    | "youtube"
    | "pinterest";
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

export type ComposerPlatform =
  | "instagram"
  | "linkedin"
  | "facebook"
  | "youtube"
  | "tiktok"
  | "pinterest"
  | "x";

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

export type ComposerPostVariant = {
  id: string;
  socialAccountId?: string | null;
  platform: ComposerPlatform;
  text: string;
  publishStatus: string;
  media: Array<{
    id: string;
    sortOrder: number;
    mediaAsset: MediaAsset;
  }>;
};

export type ComposerPostDetail = ComposerPost & {
  workspaceId: string;
  title?: string | null;
  baseText: string;
  workflowStatus: string;
  variants: ComposerPostVariant[];
};

export type PublishedPost = {
  id: string;
  postId: string;
  title?: string | null;
  baseText: string;
  scheduledAt: string;
  publishedAt: string;
  platform: ComposerPlatform;
  text: string;
  socialAccount?: {
    id: string;
    displayName: string;
    platform: ComposerPlatform;
    avatarUrl?: string | null;
  } | null;
  media: Array<{
    id: string;
    sortOrder: number;
    mediaAsset: MediaAsset;
  }>;
  providerPermalink?: string | null;
};

export type CosUploadIntent = {
  assetId: string;
  key: string;
  bucket: string;
  region: string;
  credentials: {
    tmpSecretId: string;
    tmpSecretKey: string;
    sessionToken: string;
    startTime: number;
    expiredTime: number;
  };
};

export type ComposerPost = {
  id: string;
  title?: string | null;
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
    platform: "x" | "instagram" | "facebook" | "tiktok" | "linkedin" | "youtube" | "pinterest";
    socialAccount?: {
      id: string;
      displayName: string;
      platform: "x" | "instagram" | "facebook" | "tiktok" | "linkedin" | "youtube" | "pinterest";
      avatarUrl?: string | null;
    } | null;
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
