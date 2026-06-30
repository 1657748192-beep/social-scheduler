import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Social Scheduler",
  description: "Social Scheduler \u793e\u4ea4\u5a92\u4f53\u5185\u5bb9\u6392\u7a0b\u5de5\u4f5c\u53f0",
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
