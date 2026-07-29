"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, type AuthResponse } from "../lib/api";
import { LanguageToggle, useLanguage } from "./LanguageProvider";

type AuthFormProps = {
  mode: "login" | "register";
};

const copy = {
  brandSubtitle: "\u793e\u4ea4\u5a92\u4f53\u5185\u5bb9\u6392\u7a0b\u5de5\u4f5c\u53f0",
  loginTitle: "\u767b\u5f55\u540e\u53f0",
  registerTitle: "\u521b\u5efa\u8d26\u53f7",
  loginDescription: "\u4f7f\u7528\u8d26\u53f7\u8fdb\u5165 Social Scheduler \u5185\u5bb9\u6392\u7a0b\u540e\u53f0\u3002",
  registerDescription: "\u521b\u5efa\u8d26\u53f7\u540e\u4f1a\u81ea\u52a8\u751f\u6210\u9ed8\u8ba4\u5de5\u4f5c\u533a\u3002",
  name: "\u59d3\u540d",
  email: "\u90ae\u7bb1",
  password: "\u5bc6\u7801",
  forgotPassword: "\u5fd8\u8bb0\u5bc6\u7801\uff1f",
  submitting: "\u8bf7\u7a0d\u7b49...",
  requestFailed: "\u8bf7\u6c42\u5931\u8d25",
  goLogin: "\u53bb\u767b\u5f55",
  createOne: "\u521b\u5efa\u4e00\u4e2a",
  alreadyAccount: "\u5df2\u6709\u8d26\u53f7\uff1f",
  noAccount: "\u8fd8\u6ca1\u6709\u8d26\u53f7\uff1f"
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === "register";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = isRegister
      ? {
          name: String(formData.get("name") ?? ""),
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? "")
        }
      : {
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? "")
        };

    try {
      const response = await apiRequest<AuthResponse>(isRegister ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: payload
      });

      localStorage.setItem("social_scheduler_token", response.token);
      router.push("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t(copy.requestFailed, "Request failed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="auth-language-toggle">
        <LanguageToggle compact />
      </div>
      <div className="auth-brand">
        <span className="brand-mark">S</span>
        <div>
          <h1>Social Scheduler</h1>
          <p>{t(copy.brandSubtitle, "Social media content scheduling workspace")}</p>
        </div>
      </div>

      <div className="auth-intro">
        <h2>{isRegister ? t(copy.registerTitle, "Create account") : t(copy.loginTitle, "Sign in")}</h2>
        <p className="muted">
          {isRegister
            ? t(copy.registerDescription, "A default workspace will be created with your account.")
            : t(copy.loginDescription, "Sign in to Social Scheduler to manage your content schedule.")}
        </p>
      </div>

      <form className="form" onSubmit={onSubmit}>
        {isRegister ? (
          <label className="field">
            <span>{t(copy.name, "Name")}</span>
            <input name="name" autoComplete="name" required />
          </label>
        ) : null}

        <label className="field">
          <span>{t(copy.email, "Email")}</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>

        <label className="field">
          <span className="field-heading">
            <span>{t(copy.password, "Password")}</span>
            {!isRegister ? <Link href="/forgot-password">{t(copy.forgotPassword, "Forgot password?")}</Link> : null}
          </span>
          <input
            name="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={isRegister ? 8 : undefined}
            required
          />
        </label>

        <button className="button" disabled={isSubmitting} type="submit">
          {isSubmitting
            ? t(copy.submitting, "Please wait...")
            : isRegister
              ? t(copy.registerTitle, "Create account")
              : t(copy.loginTitle, "Sign in")}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      <p className="muted auth-switch">
        {isRegister ? (
          <>
            {t(copy.alreadyAccount, "Already have an account?")}
            <Link href="/login">{t(copy.goLogin, "Sign in")}</Link>
          </>
        ) : (
          <>
            {t(copy.noAccount, "New to Social Scheduler?")}
            <Link href="/register">{t(copy.createOne, "Create an account")}</Link>
          </>
        )}
      </p>
    </section>
  );
}
