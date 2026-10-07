"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { InstagramInbox } from "../../components/inbox/InstagramInbox";
import { FacebookInbox } from '../../components/inbox/FacebookInbox';
import { InboxPlatformTabs } from '../../components/inbox/InboxPlatformTabs';
import { useFacebookEnabled } from '../../components/social/useFacebookEnabled';
import { useLanguage } from "../../components/LanguageProvider";
import { apiRequest, type Workspace } from "../../lib/api";

export default function InboxPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [platform,setPlatform]=useState<'instagram'|'facebook'>('instagram');
  const facebookEnabled=useFacebookEnabled(token);

  useEffect(() => {
    const storedToken = localStorage.getItem("social_scheduler_token");
    if (!storedToken) {
      router.replace("/login");
      return;
    }
    setToken(storedToken);
    apiRequest<Workspace[]>("/workspaces", { token: storedToken })
      .then(setWorkspaces)
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : t("无法加载工作区", "Unable to load workspaces")));
  }, [router, t]);

  return (
    <AppShell title={t("收件箱", "Inbox")} subtitle={t("查看消息并由团队成员手动回复", "Review messages and reply manually as a team")} wide>
      {error ? <p className="error">{error}</p> : null}
      {token && workspaces.length ? <><InboxPlatformTabs enabled={facebookEnabled} value={facebookEnabled?platform:'instagram'} onChange={setPlatform}/>
        {facebookEnabled && platform==='facebook'?<FacebookInbox token={token} workspaces={workspaces}/>:<InstagramInbox token={token} workspaces={workspaces}/>}</> : null}
      {token && !workspaces.length && !error ? (
        <section className="panel">
          <h1>{t("暂无工作区", "No workspace")}</h1>
          <p className="muted">{t("请先创建工作区，再使用 Instagram 收件箱。", "Create a workspace before using the Instagram inbox.")}</p>
        </section>
      ) : null}
    </AppShell>
  );
}
