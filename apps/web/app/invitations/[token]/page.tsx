"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { invitationStatusLabel, roleLabel } from "../../../lib/labels";

type InvitationPreview = {
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  workspace: {
    name: string;
    slug: string;
  };
};

export default function InvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<InvitationPreview>(`/invitations/${token}`)
      .then(setInvitation)
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "未找到邀请")
      );
  }, [token]);

  async function acceptInvite() {
    const authToken = localStorage.getItem("social_scheduler_token");

    if (!authToken) {
      setError("请先使用被邀请的邮箱登录，再接受邀请。");
      return;
    }

    try {
      await apiRequest(`/invitations/${token}/accept`, {
        method: "POST",
        token: authToken
      });
      setMessage("邀请已接受，正在跳转到控制台。");
      setTimeout(() => router.push("/dashboard"), 800);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "请求失败");
    }
  }

  return (
    <main className="page">
      <section className="auth-card">
        <h1>工作空间邀请</h1>
        {invitation ? (
          <>
            <p className="muted">
              {invitation.email} 被邀请加入 {invitation.workspace.name}，权限为{" "}
              {roleLabel(invitation.role)}。
            </p>
            <p className="muted">状态：{invitationStatusLabel(invitation.status)}</p>
            <button className="button" type="button" onClick={acceptInvite}>
              接受邀请
            </button>
          </>
        ) : (
          <p className="muted">正在加载邀请</p>
        )}
        {message ? <p>{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <p className="muted">
          <Link href="/login">登录</Link> 或 <Link href="/register">创建账号</Link>
        </p>
      </section>
    </main>
  );
}
