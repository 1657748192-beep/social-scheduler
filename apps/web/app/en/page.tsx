import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "../../components/public/PublicSiteChrome";
import { PublicHomeContent } from "../../components/public/PublicHomeContent";

export const metadata: Metadata = {
  title: "Social Scheduler | Plan and publish social content",
  description: "Social Scheduler helps creators and businesses connect social accounts, prepare original content, schedule posts, and review publishing results."
};

export default function EnglishHomePage() {
  return (
    <main className="public-site">
      <PublicHeader locale="en" page="home" />
      <PublicHomeContent locale="en" />
      <PublicFooter locale="en" />
    </main>
  );
}
