# Public website / TikTok profile disclosure — 2026-10-21

## Approved scope

Improve existing public website, unify the displayed application name to Social Scheduler, add actual interface screenshots using demo data, and explain optional `user.info.profile`. Deploy web only; no API/Worker restart, permission application, review resubmission, database migration, credential or schedule change.

## Implementation

- User clarified that other platforms use Social Scheduler. All proposed BufferHelp branding edits were withdrawn before deployment; public/legal/login/authenticated name remains Social Scheduler. TikTok developer-portal name and all provider configuration remain unchanged.
- Public product tour contains actual account-manager and editor screenshots with synthetic data, clear demo disclaimer, descriptive alt text, full-size links, fixed dimensions and lazy loading. No fake successful publication or approval badge.
- Profile explanation and privacy policies match `queryTikTokProfile`: username and profile link only; no biography/verification-status request, and additional response not persisted. Avatar/display name remains basic scope. Additional profile scope is not yet approved for general availability; it grants no publishing/comment/message capability.
- Legal links remain visible without login/menu. New navigation wraps on phones.
- Screenshot provenance: apps/web/public/product/SOURCES.md.

## Verification log

- RED: branding expectation and two rendered public-home tests failed against old implementation; JSX runtime fixture corrected and missing-content failures observed.
- GREEN: focused rendered/branding tests 3/3.
- Local actual-browser QA: `/en` and `/` at 1440px and 360px, no horizontal overflow, both screenshots decoded; `/en/privacy`, `/en/terms`, `/privacy`, `/terms`, `/login` return 200 and consistent brand. Profile disclosures present in both privacy routes; no page errors.
- Independent read-only review: identified mobile nav overflow; fixed wrapping and verified both mobile languages. Final screenshots reviewed: no customer identifiers, emails, tokens or credentials visible.
- Final focused tests 4/4; final production web build passed. Production-build browser QA repeated at both widths/languages, 5 public routes, zero page errors.
- Full `npm test`: 1083 total, 1078 passed, 5 failed. Four upload cases returned 507 because C: had only ~700MB available versus the existing 2GiB safety threshold; the scheduling UI integration also lacked its expected POST in this run. No application logic was changed to suppress these failures.
- Rechecked all three affected integration files with test-only TEMP/TMP redirected to a fresh D: directory (4GiB+ free): 11/11 passed, including all five previously failing cases. Scheduling failure did not reproduce; its original cause is not proven. All other cases passed in the full run. Existing react-test-renderer deprecation warnings and local Next.js multiple-lockfile warning remain.
- Web image revision `1ac00e691e66633ce4c7c0715fa85ba7b1ddfbeb`. Tencent existing-instance build `inv-ga6avc0j5d`: success, 14:12:40–14:13:32 Beijing time. Web-only activation `inv-ja6awj04kw`: success, 14:13:58–14:14:07. One startup HTTP 502 recovered within the bounded health loop; subsequent checks passed.
- Activation verified captured web environment/mounts, all protected publishing model HMACs, environment-file hashes and API/Worker/Postgres/Redis/proxy container identities/images/start times unchanged. API health OK; public static build manifest and both PNGs exactly match deployed image/archive. English locale SSR/loading regression checks also passed. No API build/restart, migration, Redis change, new cloud resource or permission/review submission.
- Fresh external HTTP request: `/en` 200, product tour and profile disclosure present, Social Scheduler name unchanged.
- Final external browser QA repeated on deployed `/en` and `/` at 1440/360px: no horizontal overflow, both images decoded, correct name. All five public legal/login routes returned 200; zero page errors. No authenticated session or write action used.

## Constraints

Website improvements do not guarantee TikTok approval. No review submission is performed. Facebook investigation remains on hold.
