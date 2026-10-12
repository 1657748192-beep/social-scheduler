export type TikTokPostAccount = {
  id: string; workspaceId: string; platform: string; providerAccountId: string; status: string;
};

export async function resolveTikTokPostAccount<T extends TikTokPostAccount>(
  workspaceId: string,
  linkedAccount: T | null,
  rawResponse: unknown,
  findAccount?: (workspaceId: string, providerAccountId: string) => Promise<T | null>
): Promise<T | null> {
  const details = rawResponse && typeof rawResponse === "object" && !Array.isArray(rawResponse)
    ? rawResponse as Record<string, unknown> : {};
  if (details.simulated === true) return null;
  const savedId = details.tiktokAccountId;
  const valid = (account: T) => account.workspaceId === workspaceId && account.platform === "tiktok" &&
    ["active", "token_expired"].includes(account.status) &&
    (savedId === undefined || savedId === account.providerAccountId);
  if (linkedAccount) return valid(linkedAccount) ? linkedAccount : null;
  // Recovery requires saved provider identity, never a display name, caption or local row ID.
  if (!findAccount || details.platform !== "tiktok" || typeof savedId !== "string" || !savedId.trim() || savedId !== savedId.trim()) return null;
  const restored = await findAccount(workspaceId, savedId);
  return restored && valid(restored) ? restored : null;
}
