"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, type AuthResponse } from "../lib/api";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload =
      mode === "register"
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
      const response = await apiRequest<AuthResponse>(
        mode === "register" ? "/auth/register" : "/auth/login",
        {
          method: "POST",
          body: payload
        }
      );

      localStorage.setItem("social_scheduler_token", response.token);
      router.push("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "请求失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-card">
      <h1>{mode === "register" ? "创建账号" : "登录"}</h1>
      <p className="muted">
        {mode === "register"
          ? "创建账号后会自动生成默认工作空间。"
          : "使用账号进入社交内容排程后台。"}
      </p>

      <form className="form" onSubmit={onSubmit}>
        {mode === "register" ? (
          <label className="field">
            <span>姓名</span>
            <input name="name" autoComplete="name" required />
          </label>
        ) : null}

        <label className="field">
          <span>邮箱</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>

        <label className="field">
          <span>密码</span>
          <input
            name="password"
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            minLength={mode === "register" ? 8 : undefined}
            required
          />
        </label>

        <button className="button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "请稍等" : mode === "register" ? "创建账号" : "登录"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      <p className="muted">
        {mode === "register" ? (
          <>
            已有账号？<Link href="/login">去登录</Link>
          </>
        ) : (
          <>
            还没有账号？<Link href="/register">创建一个</Link>
          </>
        )}
      </p>
    </section>
  );
}
