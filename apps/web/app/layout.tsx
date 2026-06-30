import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Social Scheduler",
  description: "Social Scheduler social media content scheduling dashboard",
  icons: {
    icon: "/app-icon-1024.png"
  },
  other: {
    "facebook-domain-verification": "g8dii6lm4xjnlxehhp67meorkasude"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
