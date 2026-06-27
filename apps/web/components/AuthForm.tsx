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
      setError(requestError instanceof Error ? requestError.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-card">
      <h1>{mode === "register" ? "Create account" : "Sign in"}</h1>
      <p className="muted">
        {mode === "register"
          ? "Start with a workspace and a ready API token."
          : "Use your account to access the scheduling dashboard."}
      </p>

      <form className="form" onSubmit={onSubmit}>
        {mode === "register" ? (
          <label className="field">
            <span>Name</span>
            <input name="name" autoComplete="name" required />
          </label>
        ) : null}

        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            minLength={mode === "register" ? 8 : undefined}
            required
          />
        </label>

        <button className="button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Please wait" : mode === "register" ? "Create account" : "Sign in"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      <p className="muted">
        {mode === "register" ? (
          <>
            Already registered? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            Need an account? <Link href="/register">Create one</Link>
          </>
        )}
      </p>
    </section>
  );
}
