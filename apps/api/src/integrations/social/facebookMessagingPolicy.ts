export function isFacebookMessagingWindowOpen(lastInboundAt: Date | null, now: Date): boolean {
  if (!lastInboundAt) return false;
  const elapsed = now.getTime() - lastInboundAt.getTime();
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 24 * 60 * 60 * 1000;
}
