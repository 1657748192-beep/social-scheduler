# Cached inbox avatars — 2026-10-21

## Approved scope

User approved existing Facebook customer/author/Page avatars in the inbox list, conversation header, contact panel and message bubbles. Use existing data only; missing or broken images keep initials. No added Meta/Graph requests, no permissions, credential or Schedule changes, no Worker restart, no deployment. This is a bounded change to the existing inbox flow, not profile enrichment.

## Implementation

- Case DTO exposes cached customer and Page image URLs. Customer identity matches the case asset/platform/app namespace; Page data matches the bound workspace/platform/provider Page. If the publishing account lacks a safe image URL, its exact cached management Page can supply it. No persistent rows are rewritten.
- Facebook detail maps known sender IDs to cached identities of its exact current asset/connection epoch. Another author's reply does not inherit the root customer's avatar. Existing Page-reply identity verification remains intact; outgoing bubbles use the Page image. Root comments or verified one-customer conversations may use the case customer fallback. Deleted items receive no image URL.
- Contact panel selects the identity for the current account rather than blindly using the first identity. List/header/message/contact reuse `InboxAvatar` with existing CSS. Initials always remain underneath; image failure removes the image, and a changed cached URL creates a new image attempt.
- Both API and web allow only stored HTTPS CDN image URLs (including Facebook fbcdn/fbsbx), reject credentials/ports/Graph endpoints and token-bearing query parameters. No Graph URL is constructed from an actor ID. Browser image loading of an existing CDN URL is normal rendering, not an added Graph/API lookup. Uncached personal avatars intentionally remain initials.

## Test-first and review

- Initial six regressions failed: case/detail avatar fields absent, list had no image, header/message mapping absent and shared avatar component missing. After implementation, those six passed.
- Extended focused run passed21/21, covering exact-asset versus same-name foreign actor, Page fallback from cached management data, no customer substitution for other reply authors, no network/write in cached case presentation, Graph/token URL rejection, broken-image initials and URL-change retry. Existing reply/detail and adapter tests remain green.
- Independent read-only review found no critical/important issues and no added provider calls or mutation/deployment paths. No parallel database tests were run during the full regression.
- API and web production builds both exited 0. Web emitted the existing multiple-lockfile/tracing-root warning.
- Full `npm test` passed 1,111/1,111, with 0 failures, cancellations or skips; exit 0, duration 570,882 ms. Focused tests passed 21/21. Local verification does not claim a live production avatar check.

## State

Local changes only. No production commands, Meta requests, sends, OAuth changes, deployment or service restarts were performed for this task. Full regression completed in the isolated local test database; existing unrelated workspace edits remain untouched. Missing cached avatars intentionally remain initials; no profile enrichment was attempted.

## Subsequently approved deployment

- User explicitly approved API/web deployment only, Worker unchanged, no additional Meta requests or fees. Deployed source `c087f7c4ce28928b32c8d88d5790831f82a444b8`.
- Preparation `inv-ja6gk7gr7m` built both images; server started with 9,936,868 KiB free. It stopped before any service switch because the protection snapshot incorrectly ordered FacebookPageSubscriptionState by id instead of pageId. Only the external operational check was corrected; application source was unchanged.
- Activation `inv-ga6gn00egq` SUCCESS/exit 0, 2026-10-21 09:29:36–09:29:46 UTC (17:29 Beijing). Only API/web recreated, with original environment, commands, mounts and resource settings preserved. API ran node directly: no migration. Health and inbox HTML checks passed; unauthenticated inbox API remained 401.
- Publishing/user/account/credential/post/schedule/job snapshots and Facebook/Instagram management credentials, scopes and subscriptions compared equal before/after. Worker/postgres/Redis/reverse-proxy container ID, image and start time compared equal. No new cloud resource, storage bucket or paid service was created.
- Read-only cached case presentation smoke prohibited fetch and checked five Facebook cases. Five had a safe cached Page image, zero had a safe cached customer image; customer initials therefore remain expected, not a failed deployment. Avatar DTO fields and unsafe Graph URL rejection passed. No send, provider read, authorization or review submission was performed by deployment verification.
