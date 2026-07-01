"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest, type PasswordResetConfirmResponse } from "../lib/api";

const copy = {
  brandSubtitle: "\u793e\u4ea4\u5a92\u4f53\u5185\u5bb9\u6392\u7a0b\u5de5\u4f5c\u53f0",
  title: "\u8bbe\u7f6e\u65b0\u5bc6\u7801",
  description: "\u8bf7\u8f93\u5165\u65b0\u5bc6\u7801\uff0c\u957f\u5ea6\u81f3\u5c11 8 \u4f4d\u3002",
  password: "\u65b0\u5bc6\u7801",
  confirmPassword: "\u786e\u8ba4\u65b0\u5bc6\u7801",
  submit: "\u66f4\u65b0\u5bc6\u7801",
  submitting: "\u6b63\u5728\u66f4\u65b0...",
  success: "\u5bc6\u7801\u5df2\u66f4\u65b0\uff0c\u8bf7\u4f7f\u7528\u65b0\u5bc6\u7801\u767b\u5f55\u3002",
  missingToken: "\u91cd\u7f6e\u94fe\u63a5\u7f3a\u5c11 token\uff0c\u8bf7\u91cd\u65b0\u7533\u8bf7\u627e\u56de\u5bc6\u7801\u3002",
  mismatch: "\u4e24\u6b21\u8f93\u5165\u7684\u5bc6\u7801\u4e0d\u4e00\u81f4\u3002",
  requestFailed: "\u8bf7\u6c42\u5931\u8d25",
  backLogin: "\u8fd4\u56de\u767b\u5f55",
  requestAgain: "\u91cd\u65b0\u7533\u8bf7"
};

export function PasswordResetConfirmForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [error, setError] = useState<string | null>(token ? null : copy.missingToken);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!token) {
      setError(copy.missingToken);
      return;
    }

    const formData = new FormData(form);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password !== confirmPassword) {
      setError(copy.mismatch);
      return;
    }

    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      await apiRequest<PasswordResetConfirmResponse>("/auth/password-reset/confirm", {
        method: "POST",
        body: {
          token,
          password
        }
      });

      setMessage(copy.success);
      form.reset();
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
          <span>{copy.password}</span>
          <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>

        <label className="field">
          <span>{copy.confirmPassword}</span>
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        <button className="button" disabled={isSubmitting || !token} type="submit">
          {isSubmitting ? copy.submitting : copy.submit}
        </button>
      </form>

      {message ? <p className="success-text reset-message">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <p className="muted auth-switch">
        <Link href="/login">{copy.backLogin}</Link>
        <Link href="/forgot-password">{copy.requestAgain}</Link>
      </p>
    </section>
  );
}
