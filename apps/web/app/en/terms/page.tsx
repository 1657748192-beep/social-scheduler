import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "../../../components/public/PublicSiteChrome";

export const metadata: Metadata = {
  title: "Terms of Service | Social Scheduler",
  description: "Social Scheduler terms of service"
};

const supportEmail = "1657748192@qq.com";

export default function EnglishTermsPage() {
  return (
    <main className="public-site">
      <PublicHeader locale="en" page="terms" />
      <section className="legal-page public-legal-page">
        <section className="legal-card">
          <p className="legal-kicker">Social Scheduler</p>
          <h1>Terms of Service</h1>
          <p>Effective and last updated: August 7, 2026</p>
          <p>Welcome to Social Scheduler (the “Service”). The Service helps users create, preview, save, schedule, and publish social media content. By registering for, accessing, or using the Service, you agree to these Terms and to our <a href="/en/privacy">Privacy Policy</a>.</p>

          <h2>1. Service scope</h2>
          <p>The Service provides content editing, drafts, media upload, account connection, scheduling, publishing-status records, and post-reuse tools. A feature may be unavailable depending on a platform, account type, region, permission, publishing method, approval status, or a third-party platform response.</p>

          <h2>2. Accounts, permissions, and authorization</h2>
          <ul>
            <li>You must provide accurate registration information and protect your login credentials.</li>
            <li>You may connect only a social account, Page, or channel that you own, lawfully manage for your organization, or are expressly authorized to manage.</li>
            <li>You may revoke an authorization in the Service or on the applicable third-party platform. After revocation, we stop using that authorization for new connection or publishing actions.</li>
            <li>You are responsible for workspace members, invited users, and their use of the Service in your workspace.</li>
          </ul>

          <h2>3. User content and intellectual property</h2>
          <p>You retain rights in content that you upload, write, schedule, or publish. You represent that you own or have the necessary rights, licenses, permissions, and consents to publish, copy, process, and submit that content to each platform you select.</p>
          <p>You must not use the Service to publish unlawful, infringing, fraudulent, defamatory, hateful, harassing, deceptive, or other content that violates applicable law or a third-party platform&apos;s rules. We process user content only as needed to provide drafts, previews, schedules, and publishing tasks confirmed by the user.</p>

          <h2>4. Music, videos, and other media</h2>
          <p>You are solely responsible for the source, copyright, commercial license, regional availability, and lawful use of images, videos, music, trademarks, likenesses, copy, and other material. Before publishing to TikTok, you must confirm that you own or have obtained the required rights to the selected music and video. We do not obtain music, media, or third-party content rights for you.</p>

          <h2>5. Third-party platform rules prevail</h2>
          <p>Facebook, Instagram, YouTube, TikTok, LinkedIn, Pinterest, X, and other third-party platforms maintain their own developer policies, community rules, advertising rules, content standards, review requirements, and API limits. When these Terms conflict with a third-party platform rule for an operation on that third-party platform, the third-party platform rule prevails.</p>

          <h2>6. Publishing confirmation and service limitations</h2>
          <p>Before selecting publish or confirming a scheduled task, you must verify the target account, copy, media, privacy settings, interaction permissions, and time. The Service starts publishing only after you actively create and confirm a task. A third-party API may impose review, rate, content-processing, permission, refusal, outage, or link-availability limits. We do not guarantee that every item will publish successfully or at a particular time.</p>

          <h2>7. Suspension, deletion, and termination</h2>
          <p>We may suspend publishing permission, limit access, or terminate an account when we reasonably believe that a user violates these Terms, a third-party platform rule, applicable law, or threatens the Service, another user, or a third party. You may delete drafts, disconnect accounts, or request deletion of an account and related data. See the <a href="/en/privacy">Privacy Policy</a> and <a href="/data-deletion">Data Deletion</a> page for deletion rules.</p>

          <h2>8. Disclaimer and limitation of responsibility</h2>
          <p>To the maximum extent allowed by law, the Service is provided on an “as is” and “as available” basis. We are not responsible for third-party platform availability, review outcomes, account limitations, content removal, data loss, indirect losses, or disputes arising from user content, account authorization, music, or media rights. You should keep your own backups of important content and complete necessary checks before publishing.</p>

          <h2>9. TikTok regional availability</h2>
          <p>TikTok features are available only to users and businesses outside Mainland China. The Service does not offer TikTok features to users located in Mainland China.</p>

          <h2>10. Changes and contact</h2>
          <p>We may update these Terms because of service features, platform policies, or legal requirements. The latest update date appears on this page. Continuing to use the Service after an update means that you accept the updated Terms. For questions about these Terms, account access, deletion requests, or platform authorization, contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
        </section>
      </section>
      <PublicFooter locale="en" />
    </main>
  );
}
