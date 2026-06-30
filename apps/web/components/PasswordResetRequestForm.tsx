"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { apiRequest, type PasswordResetRequestResponse } from "../lib/api";

const copy = {
  brandSubtitle: "\u793e\u4ea4\u5a92\u4f53\u5185\u5bb9\u6392\u7a0b\u5de5\u4f5c\u53f0",
  title: "\u627e\u56de\u5bc6\u7801",
  description:
    "\u8f93\u5165\u6ce8\u518c\u90ae\u7bb1\uff0c\u6211\u4eec\u4f1a\u53d1\u9001\u4e00\u4e2a\u8bbe\u7f6e\u65b0\u5bc6\u7801\u7684\u94fe\u63a5\u3002",
  email: "\u90ae\u7bb1",
  submit: "\u53d1\u9001\u91cd\u7f6e\u94fe\u63a5",
  submitting: "\u6b63\u5728\u53d1\u9001...",
  success:
    "\u5982\u679c\u8be5\u90ae\u7bb1\u5df2\u6ce8\u518c\uff0c\u91cd\u7f6e\u5bc6\u7801\u94fe\u63a5\u5df2\u53d1\u51fa\u3002",
  debugLink: "\u5f00\u53d1\u6a21\u5f0f\u91cd\u7f6e\u94fe\u63a5",
  requestFailed: "\u8bf7\u6c42\u5931\u8d25",
  backLogin: "\u8fd4\u56de\u767b\u5f55"
};

export function PasswordResetRequestForm() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setResetUrl(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await apiRequest<PasswordResetRequestResponse>("/auth/password-reset/request", {
        method: "POST",
        body: {
          email: String(formData.get("email") ?? "")
        }
      });

      setMessage(copy.success);
      setResetUrl(response.resetUrl ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : copy.requestFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="auth-brand">
        <span className="brand-mark">S</span>
        <div>
          <h1>Social Scheduler</h1>
          <p>{copy.brandSubtitle}</p>
        </div>
      </div>

      <div className="auth-intro">
        <h2>{copy.title}</h2>
        <p className="muted">{copy.description}</p>
      </div>

      <form className="form" onSubmit={onSubmit}>
        <label className="field">
          <span>{copy.email}</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>

        <button className="button" disabled={isSubmitting} type="submit">
          {isSubmitting ? copy.submitting : copy.submit}
        </button>
      </form>

      {message ? <p className="success-text reset-message">{message}</p> : null}
      {resetUrl ? (
        <div className="reset-link-box">
          <span>{copy.debugLink}</span>
          <a href={resetUrl}>{resetUrl}</a>
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}

      <p className="muted auth-switch">
        <Link href="/login">{copy.backLogin}</Link>
      </p>
    </section>
  );
}
