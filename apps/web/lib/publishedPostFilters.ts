type Account = { platform: string; status: string };
type Post = { platform: string; socialAccount?: { id: string } | null };
export function getPlatformAccounts<T extends Account>(accounts: readonly T[], platform: string): T[] {
  return platform === "all" ? [] : accounts.filter(account => account.platform === platform && account.status !== "disconnected");
}
export function filterPublishedPosts<T extends Post>(posts: readonly T[], platform: string, accountId: string): T[] {
  return posts.filter(post => (platform === "all" || post.platform === platform)
    && (accountId === "all" || post.socialAccount?.id === accountId));
}
