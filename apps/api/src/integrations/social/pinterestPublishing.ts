import type { Prisma } from "@prisma/client";

export type PinterestPinSettings = {
  boardId: string;
  boardName?: string;
  title: string;
  link?: string;
};

export type PinterestPinMedia = {
  mimeType: string;
  fileUrl?: string;
};

export type PinterestBoard = {
  id: string;
  name: string;
  description?: string;
  privacy?: string;
};

export type PinterestBoardPage = {
  items?: PinterestBoard[];
  bookmark?: string;
};

export type PinterestApiError = {
  code?: string | number;
  message?: string;
};

export type PinterestRefreshResult =
  | { kind: "success"; accessToken: string; refreshToken: string; expiresIn: number; scopes: string[] | null }
  | { kind: "authorization_invalid" }
  | { kind: "temporary_failure"; message: string };

export function shouldRefreshPinterestToken(expiresAt: Date | null, now = Date.now()) {
  return Boolean(expiresAt && expiresAt.getTime() <= now + 24 * 60 * 60 * 1000);
}

export function classifyPinterestApiFailure(status: number, error: PinterestApiError) {
  if (status === 401 && String(error.code) === "2") {
    return "authorization_invalid" as const;
  }
  if (status === 403 && /\b(scope|permission)\b/i.test(error.message ?? "")) {
    return "permission_missing" as const;
  }
  if (status >= 500 || status === 429) {
    return "temporary_failure" as const;
  }
  return "request_failed" as const;
}

export async function exchangePinterestRefreshToken(input: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetcher?: typeof fetch;
}): Promise<PinterestRefreshResult> {
  const response = await (input.fetcher ?? fetch)(input.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: input.refreshToken }),
    signal: AbortSignal.timeout(10000)
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  };

  if (!response.ok) {
    if (payload.error === "invalid_grant" || payload.error === "invalid_token") {
      return { kind: "authorization_invalid" };
    }
    return { kind: "temporary_failure", message: `Pinterest token refresh failed (${response.status}).` };
  }
  if (!payload.access_token || !payload.refresh_token || !payload.expires_in) {
    return { kind: "temporary_failure", message: "Pinterest token refresh returned incomplete credentials." };
  }

  return {
    kind: "success",
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
    scopes: payload.scope ? payload.scope.split(/[ ,]+/).filter(Boolean) : null
  };
}

export type PinterestStoredToken = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
};

export type PinterestTokenUpdate = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
};

export type PinterestTokenResolution =
  | { kind: "success"; accessToken: string }
  | { kind: "authorization_invalid" }
  | { kind: "permission_missing" }
  | { kind: "temporary_failure"; message: string };

export type PinterestLockedCredential = {
  credential: PinterestStoredToken | null;
  save: (update: PinterestTokenUpdate) => Promise<void>;
  setStatus: (status: "authorization_invalid" | "permission_missing") => Promise<void>;
};

export async function resolvePinterestAccessToken(input: {
  accountId: string;
  requiredScope?: string;
  force?: boolean;
  now?: number;
  withLock: (
    accountId: string,
    work: (locked: PinterestLockedCredential) => Promise<PinterestTokenResolution>
  ) => Promise<PinterestTokenResolution>;
  exchange: (refreshToken: string) => Promise<PinterestRefreshResult>;
}): Promise<PinterestTokenResolution> {
  const now = input.now ?? Date.now();
  return input.withLock(input.accountId, async (locked) => {
    const credential = locked.credential;
    if (!credential) {
      await locked.setStatus("authorization_invalid");
      return { kind: "authorization_invalid" };
    }
    if (input.requiredScope && !credential.scopes.includes(input.requiredScope)) {
      await locked.setStatus("permission_missing");
      return { kind: "permission_missing" };
    }
    if (!input.force && !shouldRefreshPinterestToken(credential.expiresAt, now)) {
      return { kind: "success", accessToken: credential.accessToken };
    }
    if (!credential.refreshToken) {
      await locked.setStatus("authorization_invalid");
      return { kind: "authorization_invalid" };
    }

    const refreshed = await input.exchange(credential.refreshToken);
    if (refreshed.kind === "authorization_invalid") {
      await locked.setStatus("authorization_invalid");
      return refreshed;
    }
    if (refreshed.kind === "temporary_failure") {
      return refreshed;
    }

    const scopes = refreshed.scopes ?? credential.scopes;
    await locked.save({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: new Date(now + refreshed.expiresIn * 1000),
      scopes
    });
    if (input.requiredScope && !scopes.includes(input.requiredScope)) {
      await locked.setStatus("permission_missing");
      return { kind: "permission_missing" };
    }
    return { kind: "success", accessToken: refreshed.accessToken };
  });
}

export async function requestPinterestApi<T>(input: {
  fallback: string;
  getToken: (force: boolean) => Promise<string>;
  send: (accessToken: string) => Promise<Response>;
  setStatus: (status: "authorization_invalid" | "permission_missing") => Promise<void>;
}): Promise<T & PinterestApiError> {
  let accessToken = await input.getToken(false);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await input.send(accessToken);
    const payload = (await response.json().catch(() => ({}))) as T & PinterestApiError;
    const failure = classifyPinterestApiFailure(response.status, payload);

    if (!response.ok && failure === "authorization_invalid" && attempt === 0) {
      accessToken = await input.getToken(true);
      continue;
    }
    if (!response.ok) {
      if (failure === "authorization_invalid" || failure === "permission_missing") {
        await input.setStatus(failure);
      }
      throw new Error(describePinterestApiError(payload, `${input.fallback} (${response.status}).`));
    }
    return payload;
  }

  throw new Error(input.fallback);
}

const pinterestBoardPageLimit = 20;

type PinterestCreatePinBody = {
  board_id: string;
  title: string;
  description: string;
  link?: string;
  media_source: {
    source_type: "image_url";
    url: string;
    is_standard: true;
  };
};

export function buildPinterestCreateBoardBody(name: string) {
  return {
    name,
    privacy: "PUBLIC" as const
  };
}

function readTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function describePinterestApiError(error: PinterestApiError | undefined, fallback: string) {
  if (!error?.message) {
    return fallback;
  }

  return error.code === undefined ? error.message : `Pinterest error ${error.code}: ${error.message}`;
}

export async function loadPinterestBoardPages(
  loadPage: (bookmark?: string) => Promise<PinterestBoardPage>
) {
  const boards: PinterestBoard[] = [];
  let bookmark: string | undefined;

  for (let page = 0; page < pinterestBoardPageLimit; page += 1) {
    const response = await loadPage(bookmark);
    boards.push(...(response.items ?? []).filter((board) => board.id && board.name));
    bookmark = response.bookmark?.trim() || undefined;

    if (!bookmark) {
      break;
    }
  }

  return boards;
}

export function readPinterestPinSettings(value: Prisma.JsonValue | Record<string, unknown> | undefined): PinterestPinSettings | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const boardId = readTrimmedString(record.boardId);
  const boardName = readTrimmedString(record.boardName);
  const title = readTrimmedString(record.title);
  const link = readTrimmedString(record.link);

  return {
    boardId,
    ...(boardName ? { boardName } : {}),
    title,
    ...(link ? { link } : {})
  };
}

function isValidPinterestLink(link: string) {
  try {
    const url = new URL(link);
    return (url.protocol === "http:" || url.protocol === "https:") && link.length <= 2048;
  } catch {
    return false;
  }
}

export function getPinterestPinValidationError(
  value: Prisma.JsonValue | Record<string, unknown> | undefined,
  media: PinterestPinMedia[],
  description: string
) {
  const settings = readPinterestPinSettings(value);

  if (!settings?.boardId) {
    return "Choose a Pinterest board before publishing.";
  }

  if (!settings.title) {
    return "Enter a Pinterest Pin title before publishing.";
  }

  if (settings.title.length > 100) {
    return "Pinterest Pin titles can contain at most 100 characters.";
  }

  if (description.length > 800) {
    return "Pinterest descriptions can contain at most 800 characters.";
  }

  if (settings.link && !isValidPinterestLink(settings.link)) {
    return "Pinterest website links must be valid http or https URLs.";
  }

  if (media.length !== 1) {
    return "Pinterest publishing requires exactly one image.";
  }

  if (!media[0].mimeType.startsWith("image/")) {
    return media[0].mimeType.startsWith("video/")
      ? "Pinterest image Pins do not support video media yet."
      : "Pinterest publishing requires exactly one image.";
  }

  if (!media[0].fileUrl?.trim()) {
    return "Pinterest publishing requires a public image URL.";
  }

  return null;
}

export function buildPinterestCreatePinBody(
  settings: PinterestPinSettings,
  description: string,
  imageUrl: string
): PinterestCreatePinBody {
  return {
    board_id: settings.boardId,
    title: settings.title,
    description,
    ...(settings.link ? { link: settings.link } : {}),
    media_source: {
      source_type: "image_url",
      url: imageUrl,
      is_standard: true
    }
  };
}

export function pinterestPinPermalink(pinId: string) {
  return `https://www.pinterest.com/pin/${pinId}/`;
}
