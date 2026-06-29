import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "社交内容排程后台",
  description: "社交媒体内容排程 SaaS",
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
