export type InstagramReadMetadata = { source?: string; providerReadStatus?: string; lastReceivedAt?: string | null };
export type InstagramReceptionStatus = { revision: string; lastReceivedAt: string | null; serverReady: boolean; subscriptionStatus: string; subscribedFields: string[]; callbackStatus: string; publicationStatus: string };

export function instagramReadNotice(meta: InstagramReadMetadata | null, total: number, visible: number) {
  if (meta?.providerReadStatus === "error") return "provider_error";
  if (meta?.providerReadStatus === "empty" && total > 0 && visible === 0) return "visibility";
  return null;
}
export function instagramInboxReadNotice(conversations: InstagramReadMetadata | null, messages: InstagramReadMetadata | null) {
  return conversations?.providerReadStatus === "error" || messages?.providerReadStatus === "error" ? "provider_error" : null;
}
export async function readInstagramPostActivity<M, C>(metrics: () => Promise<M>, comments: () => Promise<C>) {
  const [m, c] = await Promise.allSettled([metrics(), comments()]);
  return {
    metrics: m.status === "fulfilled" ? { data: m.value, error: null } : { data: null, error: m.reason as unknown },
    comments: c.status === "fulfilled" ? { data: c.value, error: null } : { data: null, error: c.reason as unknown }
  };
}

export function createReceptionPoller(input: {
  readStatus(): Promise<{ revision: string }>; onRevision(): Promise<void> | void;
  isVisible(): boolean; intervalMs: number;
  schedule?: (tick: () => Promise<void>, intervalMs: number) => () => void;
}) {
  let stopped = false, busy = false, revision: string | undefined;
  const tick = async () => {
    if (stopped || busy || !input.isVisible()) return;
    busy = true;
    try {
      const status = await input.readStatus();
      if (stopped) return;
      const changed = status.revision !== revision;
      if (changed) await input.onRevision();
      revision = status.revision;
    } catch { /* readStatus surfaces its own status error; retry on the next visible tick. */ }
    finally { busy = false; }
  };
  const cancel = input.schedule ? input.schedule(tick, input.intervalMs) : (() => {
    const timer = setInterval(() => void tick(), input.intervalMs);
    return () => clearInterval(timer);
  })();
  return { stop() { stopped = true; cancel(); } };
}
