import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "../../../components/public/PublicSiteChrome";

export const metadata: Metadata = {
  title: "Privacy Policy | Social Scheduler",
  description: "Social Scheduler privacy policy"
};

const supportEmail = "1657748192@qq.com";

export default function EnglishPrivacyPage() {
  return (
    <main className="public-site">
      <PublicHeader locale="en" page="privacy" />
      <section className="legal-page public-legal-page">
        <section className="legal-card">
          <p className="legal-kicker">Social Scheduler</p>
          <h1>Privacy Policy</h1>
          <p>Effective and last updated: August 5, 2026</p>
          <p>
            Social Scheduler (the “Service”) helps users connect authorized social media accounts, create content,
            schedule publishing, and publish content that a user confirms to a selected platform. This policy explains
            what information we process, why we process it, how long it is retained, and how users can exercise their rights.
          </p>

          <h2>1. Information we collect</h2>
          <ul>
            <li><strong>Account and workspace information:</strong> registration email, display name where provided, workspace name, member roles, invitations, and login-session information. Passwords are stored only as irreversible secure hashes.</li>
            <li><strong>Content created by users:</strong> post copy, links, scheduled times, platform-specific versions, publishing settings, drafts, and the images or videos that users upload.</li>
            <li><strong>Authorized social-account information:</strong> account identifiers, public display names, profile images where supplied by a platform, and access tokens returned after a user authorizes Facebook, Instagram, YouTube, TikTok, LinkedIn, Pinterest, X, or another supported platform. Tokens are encrypted and used only for the authorized connection, lookup, and publishing features.</li>
            <li><strong>Publishing and operational records:</strong> task status, publishing time, returned content links, and error information. These records let users see results, diagnose failures, and avoid duplicate publishing.</li>
          </ul>

          <h2>2. Third-party authorization data and purpose</h2>
          <p>
            A user chooses whether to connect each platform. We process platform data only after the user authorizes the Service on that platform&apos;s official OAuth page and only within the granted scope. We do not collect or store any third-party platform password.
          </p>
          <ul>
            <li><strong>Facebook:</strong> public profile information and the identifiers, names, profile images, and permitted access of authorized Pages are used to display available Pages and to perform a user-confirmed Page publishing or management action.</li>
            <li><strong>Instagram:</strong> the identifier, username or display name, profile image, and necessary token for an authorized professional account are used to display the chosen Instagram account and carry out a user-initiated publishing operation.</li>
            <li><strong>YouTube:</strong> <code>youtube.readonly</code> is used only to read and display an authorized YouTube channel. <code>youtube.upload</code> is used only after the user selects an original video, provides its details, and confirms upload to that selected channel.</li>
            <li><strong>TikTok:</strong> <code>user.info.basic</code> is used only to receive TikTok&apos;s Open ID, public profile image, and display name so the user can identify the selected account. <code>video.publish</code> is used only after the user selects an original video, confirms caption, privacy, interaction settings, and music-use declaration, then chooses to publish.</li>
            <li><strong>LinkedIn, Pinterest, and X:</strong> authorized account identifiers, public display names, profile images where available, and necessary tokens are used for account connection, account display, and user-initiated actions that the applicable platform allows.</li>
          </ul>
          <p>We do not read unapproved direct messages, private content, or unrelated data, and we do not publish to a third-party platform without a user&apos;s active confirmation.</p>

          <h2>3. How we use information</h2>
          <ul>
            <li>Provide registration, sign-in, workspaces, member collaboration, and account-connection features.</li>
            <li>Save drafts, create content previews, schedule tasks, and carry out publishing confirmed by the user.</li>
            <li>Show publishing results, process limited retries after failure, support copy reuse, and provide technical support.</li>
            <li>Protect accounts, tokens, and service security; detect and address abuse, failures, or policy violations.</li>
            <li>Comply with applicable legal requirements or other purposes to which a user expressly agrees.</li>
          </ul>

          <h2>4. Sharing, sale, and advertising</h2>
          <p>
            We do not sell, rent, or trade personal information, and we do not use user data for targeted advertising. We share information only when necessary: with a platform selected by the user to complete an authorized connection or publishing action; with contracted infrastructure, database, email, or security providers needed to operate the Service; or when disclosure is legally required to protect users or the Service.
          </p>

          <h2>5. Retention and automatic deletion</h2>
          <ul>
            <li><strong>Drafts:</strong> draft copy and related material are retained for 72 hours after the last save, then automatically deleted. Users may delete a draft earlier.</li>
            <li><strong>Unused uploads:</strong> uploads not referenced by a post or draft are automatically deleted after 24 hours.</li>
            <li><strong>Successful publishing source media:</strong> original images and videos are retained for 24 hours after success, then automatically deleted.</li>
            <li><strong>Failed or cancelled publishing source media:</strong> original images and videos are retained for 72 hours for troubleshooting or retry, then automatically deleted.</li>
            <li><strong>Thumbnails:</strong> only compressed image thumbnails or a video first-frame thumbnail are retained, for up to 180 days. Original video files are not retained long term.</li>
            <li><strong>Publishing records:</strong> copy, time, target account, task status, and public links are retained while the account exists so the user can view history, reuse copy, and receive support. A user may request account and associated-data deletion.</li>
          </ul>

          <h2>6. Your choices and data rights</h2>
          <ul>
            <li>You may disconnect a social account in the Service. We then stop using that account&apos;s token for new operations.</li>
            <li>You may delete drafts. The draft content and related media enter the deletion workflow.</li>
            <li>You may request deletion of your account, workspace, publishing records, and associated material through administrator features or by contacting us. We may verify control of the account before processing the request.</li>
            <li>You may revoke the Service&apos;s authorization in the settings of Facebook, Instagram, YouTube, TikTok, LinkedIn, Pinterest, X, or another connected platform.</li>
          </ul>
          <p>For a deletion request, visit <a href="/data-deletion">Data Deletion</a> or email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with your registration email and requested deletion scope.</p>

          <h2>7. Security</h2>
          <p>We use reasonable technical and organizational safeguards, including HTTPS transmission, access controls, encrypted token storage, and server-side permission separation. No internet transmission or storage method is absolutely secure; we address security incidents according to applicable law.</p>

          <h2>8. Minors</h2>
          <p>The Service is intended for users who meet the eligibility requirements of the applicable platforms and is not directed to minors where prohibited by law. If you believe a minor provided personal information, contact us using the address below.</p>

          <h2>9. TikTok regional availability</h2>
          <p>TikTok features are available only to users and businesses outside Mainland China. The Service does not offer TikTok features to users located in Mainland China.</p>

          <h2>10. Changes and contact</h2>
          <p>We may update this policy because of service, platform-policy, or legal changes. The latest update date appears on this page. For privacy, deletion, or third-party authorization questions, contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
        </section>
      </section>
      <PublicFooter locale="en" />
    </main>
  );
}
