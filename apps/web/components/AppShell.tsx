"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { apiRequest } from "../lib/api";

type AppShellProps = {
  title: string;
  subtitle?: string;
  userLabel?: string;
  wide?: boolean;
  children: ReactNode;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/composer", label: "Composer" },
  { href: "/calendar", label: "Calendar" }
];

export function AppShell({ title, subtitle, userLabel, wide = false, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const token = localStorage.getItem("social_scheduler_token");

    if (token) {
      await apiRequest("/auth/logout", {
        method: "POST",
        token
      }).catch(() => null);
    }

    localStorage.removeItem("social_scheduler_token");
    router.replace("/login");
  }

  return (
    <main className="software-shell">
      <aside className="software-sidebar">
        <div className="software-brand">
          <div className="software-mark">S</div>
          <div>
            <strong>Social Scheduler</strong>
            <span>Control Center</span>
          </div>
        </div>

        <nav className="software-nav">
          {navItems.map((item) => (
            <Link
              className={pathname === item.href ? "active" : ""}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="software-sidebar-footer">
          <span>{userLabel || "Signed in"}</span>
          <button className="button secondary" onClick={signOut} type="button">
            Sign out
          </button>
        </div>
      </aside>

      <section className="software-main">
        <header className="software-topbar">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
        </header>

        <div className={wide ? "software-content wide" : "software-content"}>{children}</div>
      </section>
    </main>
  );
}
