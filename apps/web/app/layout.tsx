import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "社交内容排程后台",
  description: "社交媒体内容排程 SaaS",
  icons: {
    icon: "/app-icon-1024.png"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
