export function subscribeDashboardClock(update: (now: Date) => void) {
  const tick = () => update(new Date());
  tick();
  const timer = setInterval(tick, 30000);
  const windowTarget = typeof window !== "undefined" ? window : null;
  const documentTarget = typeof document !== "undefined" ? document : null;
  windowTarget?.addEventListener("focus", tick);
  documentTarget?.addEventListener("visibilitychange", tick);
  return () => {
    clearInterval(timer);
    windowTarget?.removeEventListener("focus", tick);
    documentTarget?.removeEventListener("visibilitychange", tick);
  };
}
