"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";

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
        setError(requestError instanceof Error ? requestError.message : "Invitation not found")
      );
  }, [token]);

  async function acceptInvite() {
    const authToken = localStorage.getItem("social_scheduler_token");

    if (!authToken) {
      setError("Sign in with the invited email before accepting this invitation.");
      return;
    }

    try {
      await apiRequest(`/invitations/${token}/accept`, {
        method: "POST",
        token: authToken
      });
      setMessage("Invitation accepted. Redirecting to dashboard.");
      setTimeout(() => router.push("/dashboard"), 800);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed");
    }
  }

  return (
    <main className="page">
      <section className="auth-card">
        <h1>Workspace invitation</h1>
        {invitation ? (
          <>
            <p className="muted">
              {invitation.email} was invited to {invitation.workspace.name} as {invitation.role}.
            </p>
            <p className="muted">Status: {invitation.status}</p>
            <button className="button" type="button" onClick={acceptInvite}>
              Accept invitation
            </button>
          </>
        ) : (
          <p className="muted">Loading invitation</p>
        )}
        {message ? <p>{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <p className="muted">
          <Link href="/login">Sign in</Link> or <Link href="/register">create an account</Link>
        </p>
      </section>
    </main>
  );
}
