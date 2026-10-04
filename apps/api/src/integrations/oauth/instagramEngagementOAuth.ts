export const INSTAGRAM_ENGAGEMENT_SCOPES = [
  "instagram_business_manage_comments",
  "instagram_business_manage_messages"
] as const;

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
  const requiredToPreservePublishing = new Set([
    ...input.existingScopes,
    ...INSTAGRAM_PUBLISHING_SCOPES
  ]);
  if ([...requiredToPreservePublishing].some((scope) => !granted.has(scope))) {
    return { accepted: false, reason: "publishing_scope_missing" };
  }

  return { accepted: true, grantedScopes: [...granted] };
}
