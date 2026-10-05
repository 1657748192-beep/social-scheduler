export const INSTAGRAM_ENGAGEMENT_SCOPES = [
  "instagram_business_manage_comments",
  "instagram_business_manage_messages"
] as const;

export function parseInstagramGrantedScopes(tokenResponse: unknown): string[] | null {
  if (typeof tokenResponse !== "object" || tokenResponse === null || Array.isArray(tokenResponse)) return null;
  const payload = tokenResponse as Record<string, unknown>;
  const value = payload.permissions ?? payload.scope;
  if (typeof value === "string") {
    return [...new Set(value.split(/[ ,]+/).map((scope) => scope.trim()).filter(Boolean))];
  }
  if (Array.isArray(value) && value.every((scope) => typeof scope === "string")) {
    return [...new Set(value.map((scope) => scope.trim()).filter(Boolean))];
  }
  return null;
}

const INSTAGRAM_PUBLISHING_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish"
] as const;

export function buildInstagramEngagementScopes(existingScopes: string[]) {
  return [...new Set([
    ...existingScopes,
    ...INSTAGRAM_PUBLISHING_SCOPES,
    ...INSTAGRAM_ENGAGEMENT_SCOPES
  ])];
}

export function validateInstagramEngagementReauthorization(input: {
  expectedProviderAccountId: string;
  actualProviderAccountId: string;
  existingScopes: string[];
  grantedScopes: string[];
}):
  | { accepted: true; grantedScopes: string[] }
  | { accepted: false; reason: "account_mismatch" | "publishing_scope_missing" } {
  if (input.actualProviderAccountId !== input.expectedProviderAccountId) {
    return { accepted: false, reason: "account_mismatch" };
  }

  const granted = new Set(input.grantedScopes);
  const requiredToPreservePublishing = new Set(INSTAGRAM_PUBLISHING_SCOPES);
  if ([...requiredToPreservePublishing].some((scope) => !granted.has(scope))) {
    return { accepted: false, reason: "publishing_scope_missing" };
  }

  return { accepted: true, grantedScopes: [...granted] };
}
