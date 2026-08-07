import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "../components/public/PublicSiteChrome";
import { PublicHomeContent } from "../components/public/PublicHomeContent";

export const metadata: Metadata = {
  title: "Social Scheduler | 社交媒体内容排程与发布",
  description: "Social Scheduler 帮助创作者和企业连接已授权社交账号、创建原创内容、安排发布并查看发布结果。"
};

export default function HomePage() {
  return (
    <main className="public-site">
      <PublicHeader locale="zh-CN" page="home" />
      <PublicHomeContent locale="zh-CN" />
      <PublicFooter locale="zh-CN" />
    </main>
  );
}
