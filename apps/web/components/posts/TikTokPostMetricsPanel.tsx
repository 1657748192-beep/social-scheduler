"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest, type TikTokPostMetrics } from "../../lib/api";
import { useLanguage } from "../LanguageProvider";
import { TikTokMetricsSummary } from "./TikTokMetricsSummary";

export function TikTokPostMetricsPanel({ token, workspaceId, scheduleId }: {
  token: string; workspaceId: string; scheduleId: string;
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TikTokPostMetrics | null>(null);
  const requestVersion = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => () => { requestVersion.current += 1; }, []);

  async function load() {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setResult(null);
    const version = ++requestVersion.current;
    try {
      const data = await apiRequest<TikTokPostMetrics>(
        `/workspaces/${encodeURIComponent(workspaceId)}/tiktok/posts/${encodeURIComponent(scheduleId)}/metrics`, { token }
      );
      if (version === requestVersion.current) setResult(data);
    } catch {
      if (version === requestVersion.current) setResult({ status: "temporarily_unavailable" });
    } finally {
      inFlight.current = false;
      if (version === requestVersion.current) setLoading(false);
    }
  }

  return <section className="instagram-engagement-panel" aria-label={t("TikTok 基础帖子数据", "TikTok basic post metrics")}>
    <button type="button" className="button secondary" aria-expanded={expanded} onClick={() => {
      setExpanded(!expanded);
      if (!expanded && !result && !loading) void load();
    }}>{expanded ? t("收起数据", "Hide metrics") : t("查看数据", "View metrics")}</button>
    {expanded ? <div className="instagram-engagement-content" aria-busy={loading}>
      <div className="instagram-engagement-heading">
        <h3>{t("TikTok 基础帖子数据", "TikTok basic post metrics")}</h3>
        <button type="button" className="button secondary" disabled={loading} onClick={() => void load()}>{t("刷新", "Refresh")}</button>
      </div>
      <div aria-live="polite">
        {loading ? <p>{t("正在读取数据…", "Loading metrics…")}</p> : null}
        {result ? <TikTokMetricsSummary result={result} t={t} /> : null}
      </div>
    </div> : null}
  </section>;
}
