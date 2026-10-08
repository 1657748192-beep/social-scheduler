# Facebook engagement verification

## Local adapter stage — 2026-10-07

No production authorization, webhook subscription, customer send or deployment performed.
Adapter receives an explicit API version; existing Facebook code uses v20.0. Real Page compatibility remains a rollout acceptance check, not a claimed result.

Official references checked:
- Meta Messenger collection: https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a — Page conversations, Page token, access restrictions.
- Meta Send API: https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api — Page messages endpoint and standard reply window.
- Meta generated SDK: https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/comment.py — comment object association and comment reply edge.
- Meta reference URLs for Comment and Page subscribed_apps returned HTTP 429 during research. Subscription fields and version-specific behavior must still be verified on a controlled test Page before enablement.

The adapter never follows provider next URLs or redirects, uses Page Bearer tokens, and checks actual debug_token grant/identity for capability prerequisites. Available scope status does not prove a user's Page task or Advanced Access: real Graph requests remain authoritative. Missing/ambiguous responses are not treated as empty lists. Sends have no automatic retry, and transport/ambiguous results are returned as unknown.

Task 1 verification: 12 new adapter/policy tests passed; API TypeScript build passed; configured independent-database full suite 300 passed, 0 failed, 0 skipped. Configuration for test runs is taken from existing disposable local Docker database without printing its password. No production DB used.

## Supplemental authorization stage

Created independent `facebook_engagement_test` on the same disposable local container at 127.0.0.1:55436. Applied all 17 migrations from scratch, including additive Facebook OAuth fields. The earlier reception_test has no migration ledger, so it was not reset or baselined. All integration suites now use the new test database for this branch.

Authorization entry and dedicated callback are implemented behind FACEBOOK_ENGAGEMENT_ENABLED=false. The Meta app must allow `/api/v1/integrations/facebook-engagement/oauth/callback`; Login for Business config must include requested additional permissions. No real settings changed yet. Supplemental states cannot be used through the ordinary callback to bind every returned Page.

Task 2 verification: actual-grant gateway tests, cancellation/mismatch/replay tests, Prisma concurrent-consumption/CAS/role tests passed; API build passed; full configured suite 308 passed, no failures or skips. Publishing scopes and account status are untouched when interactive permissions are absent.

## Scoped endpoints stage

Added authenticated Page capability, comments, conversations/messages and manual reply endpoints, plus an authenticated feature-status endpoint. Replies validate comment post association or Page conversation participants before sending. Viewer writes denied; owner/admin/editor can reply. Future inbound timestamps cannot open a messaging window. Unknown provider-send outcomes are preserved without retry. The feature remains disabled by default; no real message sent.

Task 3: four service behavior tests passed; API build passed; full configured suite before the added policy characterization case: 311 passed, no failures or skips.

## Durable webhook stage

Added a signed raw-body callback before JSON parsing, database-backed event queue, per-account comment/message storage, claim leases and 90-day cleanup. Active Page bindings receive separate copies; deleting a local binding cascades only its data. Message echoes do not update the inbound reply window. Edits use notification time rather than original comment creation time. Exhausted crashed claims transition to failed; completed events clear their payload.

Task 4: webhook HTTP tests and PostgreSQL isolation/replay/order/lease/echo/retention test passed; full configured suite 316 passed, no failures or skips. API build passed. No real Meta webhook delivery verified yet.

## Page subscription lifecycle stage

Subscription operations preserve pre-existing fields and track only fields added by this feature. Cross-workspace shared Page bindings prevent premature release. Ordinary Facebook Page binding acquires the same per-Page advisory lock as subscription removal. Local disconnect and pending-release creation share a transaction; remote failures are retried at most five times for 24 hours using a temporary encrypted token, with no message content. Rebinding cancels old release work and erases its token. All new received data cascades with the removed account.

Task 5 verification: three lifecycle behavior tests and PostgreSQL multi-binding/rebind/disconnect integration test passed; full configured suite 320 passed, no failures or skips; API build passed. Real Meta subscription writes have not been performed.

## UI integration stage

Facebook is conditionally available in the shared inbox, leaving Instagram selected by default. Page capability panels and post comments use bilingual messages and official platform artwork. Requests are generation-scoped, sends are guarded against duplication, and unknown sends explicitly require verification without retry. Signed locally received conversations are account-scoped and can only reply within a verified inbound window. Subscription status queries actual subscribed fields rather than treating metadata permission as subscription proof.

Ten focused service/UI tests passed. API and web builds passed. UI tests exercise production request guards and rendered views, not full browser interactions; real end-to-end browser and Meta delivery verification remain pending. The old Instagram source assertion was narrowed to its own component because Facebook is now an intentionally supported separate panel.

## Deployment gate (not executed)

Server checkout is expected at `/opt/social-scheduler`, but its current SHA and dirty state must be read again before any deployment; the previously recorded base is `e15b559`, not a claim about current server state. This branch remains local pending permission to publish/transfer it. Do not run the generic deployment script blindly: its pre-existing checkout reset and environment rewriting require a clean, reviewed target.

After explicit deployment approval: identify the exact release commit and current API/worker/web image IDs; retain tagged copies of each old image and the protected environment file. Create a timestamped, permission-restricted PostgreSQL custom-format backup under `/opt/social-scheduler-releases/facebook-<timestamp>/database.dump` (outside the checkout), list its archive and verify restoration into a separate disposable database before migrating. Check disk space. Keep FACEBOOK_ENGAGEMENT_ENABLED=false in both API and worker. Build all three images, run `prisma migrate deploy` from the new API image, then restart API/worker/web. The three new migrations add OAuth fields, reception tables and subscription state; they do not delete existing data. Check health, authenticated feature status disabled, original publishing routes and Instagram routes.

Rollback: switch back to retained old images and keep the feature off; leave additive tables in place. Do not drop columns/tables or restore the production backup automatically, because writes after the backup must not be lost. A restore needs separate downtime and data-recovery authorization.

Before enabling: confirm the Meta app, Page ID, test user role and actual permissions/Advanced Access. Configure the dedicated supplemental OAuth redirect and signed `/api/v1/webhooks/facebook` callback; verify app-level feed/messages subscriptions and Page-level subscriptions independently. A server verify-token value alone is not delivery evidence. Test only the agreed Page/account. Real comments/messages and outbound reply recipient/text require user confirmation. Record Graph reads, Webhook delivery, persisted data, UI reads and official inbox receipts; only then record end-to-end success or use it for review video.

## Independent review and fix pass

Fresh read-only review of `e15b559..aad634e` plus `7e6f6eb` found six Important issues and no Critical/Minor findings. All six were addressed: provider token errors now return 409, mixed batches persist valid events before a retry response, local retention/token expiry run with the feature off, received comment edits/tombstones reconcile Graph comments, received messages merge into verified Graph conversations, and Page conversation requests use a scope independent of selected message threads.

Regression tests observed RED then GREEN for provider expiry, signed mixed batches, disabled remote cleanup, processed comment tombstones through the service output, remote conversations with Webhook-only messages and actual React Page-selection effects. Added react-test-renderer matching the installed React version solely as a development test dependency; its deprecation warning is visible, so full browser verification is still required. Application-session 401 handling remains unchanged and is separately tested.

Final configured test run: 332 passed, 0 failed, 0 skipped. Independent test database enabled TikTok Sandbox isolation tests too; missing test configuration is not waived. API build passed. Production environment and real Meta access are not tested here.

Dependency audit also reports existing runtime/tooling alerts, including critical classifications for Next.js/proxy-addr/shell-quote. These packages were not upgraded in this feature branch; the three newly added development-test packages are not listed in that report. Dependency remediation needs a separately scoped compatibility/security assessment before production rollout; no automatic audit fix was run.

Subsequent dependency remediation (2026-10-07): see [dependency-security-verification.md](dependency-security-verification.md). The refreshed local audit reports 0 vulnerabilities; 336 configured tests and API/web builds pass. This supersedes the earlier audit state above, not the deployment gate. Clean Alpine container verification, production rollout, and real Meta end-to-end checks remain pending.

## Production deployment — 2026-10-08

User approved deployment and subsequently approved transfer via the existing GitHub repository's independent branch. Server tracked files were clean at `e15b559`; untracked environment backups were preserved. Fast-forwarded to `da6fdaeb26c00ce2c153caa3bbdf6a1a081029c8` without reset or cleanup.

- Restricted backup directory: `/opt/social-scheduler-releases/facebook-da6fdae-20261008` (0700). Original environment/Compose files and previous commit retained. PostgreSQL custom dump approximately 1.1 MB; archive listing passed and full restoration into independent `facebook_restore_da6fdae_20261008` completed with `pg_restore --exit-on-error`. Verification database retained; production data was not overwritten.
- Previous API/worker/web images tagged `social-scheduler-<service>:before-facebook-da6fdae` for rollback.
- Background Linux builds of all three application images completed with exit 0. Candidate Node v22.23.3 passed proxy-trust and Sharp in-memory PNG smoke checks. Facebook flag was false.
- Three additive migrations applied successfully: `20261007000000_facebook_engagement_oauth`, `20261007000100_facebook_reception`, `20261007000200_facebook_subscription_state`.
- API/worker/web updated. PostgreSQL, Redis and reverse proxy were not restarted. Main application containers remained running during post-deployment checks.
- Public health returned `ok:true`, database `ok`, Redis `PONG`; `/dashboard`, `/posts`, `/inbox`, `/social-accounts` returned HTTP 200. These are availability checks, not authenticated browser/end-to-end publishing tests.
- Unauthenticated Facebook status endpoint returned 401. Both API and worker had `FACEBOOK_ENGAGEMENT_ENABLED=false`; API retained TikTok Sandbox enabled. Production `.env` and `.env.sandbox.local` byte comparisons against backups matched.
- Recent API/worker log error/fatal/panic keyword counts were 0; this is a limited log smoke check, not proof of all behavior.

Remaining enablement gate: authenticated UI checks, agreed Meta Page/role/permissions, supplemental redirect and webhook configuration, actual provider reads/delivery and manually approved replies. No real Facebook messages or comments were sent and no Meta settings were changed during deployment.

## Supplemental login configuration isolation — 2026-10-08

Supplemental authorization now reads `FACEBOOK_ENGAGEMENT_LOGIN_CONFIG_ID`; ordinary publishing continues to read `FACEBOOK_LOGIN_CONFIG_ID`. The new variable defaults to blank, in which case supplemental authorization uses explicit scopes rather than the publishing configuration. API and worker Compose environments expose the independent variable. A real service/Prisma integration test observed RED (publishing configuration incorrectly selected), then GREEN after isolation; the configured suite passed 337 tests with no failures or skips and API build passed. Read-only review found no blocking issues. This isolation change is not yet deployed.

Meta app `1013567811268870`: enabled test preparation for `pages_manage_engagement`, `pages_read_user_content`, and `pages_manage_metadata`; added the Messenger use case, with `pages_messaging` showing ready for testing. These are preparation statuses, not approval or token grants. Enabled the Webhook configuration entry without saving a callback or subscribing any fields.

Created separate user-token, standard-login configuration `Social Scheduler Engagement`, ID `1119177347324881`, selecting `pages_manage_engagement`, `pages_manage_metadata`, `pages_manage_posts`, `pages_messaging`, `pages_read_engagement`, `pages_read_user_content`, and `pages_show_list`. Existing `Social Scheduler Page Publish`, ID `1748083276619458`, remained in the configuration list and was not edited. App remains unpublished.

Appended `https://app.bufferhelp.com/api/v1/integrations/facebook-engagement/oauth/callback` to the OAuth redirect whitelist. Reload confirmed persistence of all three redirects, including existing Facebook and Instagram callbacks. HTTPS/strict matching settings were not changed. New server environment value, Webhook verification, user supplemental consent and real provider reads/delivery remain pending; no customer message or comment was sent.

### Isolation rollout (supersedes the pending deployment note above)

Fresh configured tests passed 337/337 with no failures or skips; API build and diff check passed. Pushed release `da225083425a0c0159539f894cc18aafa1b97606` on the existing independent branch. Server tracked files were clean at `da6fdae`; untracked backups were preserved. Protected `/opt/social-scheduler-releases/facebook-da22508-20261008` backup (0700, ubuntu-owned), prior environment/Compose files and previous commit were retained; prior API/worker images tagged `before-facebook-da22508`. Initial unprivileged backup-directory creation failed before any code changes; an explicitly scoped administrator directory creation resolved that permission issue.

Fast-forwarded to the exact release. Added only `FACEBOOK_ENGAGEMENT_LOGIN_CONFIG_ID=1119177347324881` to `.env`. Comparison excluding that new line and blank lines confirmed every pre-existing nonblank environment line unchanged; `.env.sandbox.local` byte comparison matched its backup. Background API/worker builds exited 0. Recreated only API and worker with interaction feature explicitly off; no migrations ran. Runtime checks in both containers confirmed publishing configuration `1748083276619458`, engagement configuration `1119177347324881`, and enabled=false. API retained TikTok Sandbox enabled. Public health reported database ok and Redis PONG; dashboard and inbox returned 200.

Remaining gate: Facebook Webhook GET verification is disabled with the feature off (503), so activation needs explicit security-sensitive access confirmation before the handshake. Target is only Page `182945841568122`, `Legustau Fashion Women's Bag`; no Page subscription, supplemental token grant or real customer read/reply has been performed. Configuration creation and ready-for-testing statuses do not prove real granted permissions.

### Confirmed activation and app-level Webhook setup

User explicitly confirmed activation, supplemental authorization and Webhook configuration for the named test Page. Verified the runtime app ID equals `1013567811268870` before changes. Read-only Graph app subscription inspection returned HTTP 200 with an empty list. Preserved `.env` immediately before activation as protected `before-enable.env` in the release backup directory. Enabled the feature and generated a dedicated random verification token on the server without printing it; no other platform secret was changed. Recreated API and worker using the existing built images. Runtime API output confirmed enabled=true, verification token present and independent engagement configuration `1119177347324881`.

Public callback challenge verification returned HTTP 200 and the exact expected challenge. Used Meta's app subscription endpoint with credentials only in server memory, checking for conflicting existing Page callbacks before mutation. POST for object=page, fields=feed,messages returned HTTP 200 and success=true. A fresh GET confirmed an active Page subscription at `https://app.bufferhelp.com/api/v1/webhooks/facebook`, with feed and messages both reported as v25.0 by Meta despite the existing requested Graph version v20.0. No unrelated object subscription was added or removed. Public health still returned database ok and Redis PONG.

Opened the software social-account page for supplemental consent, but the current browser session displayed the login screen. No synthetic user session was created and no token-grant check was bypassed. Pending: user software login, genuine supplemental OAuth consent for the test Page, Page-level subscription acquisition, real permission inspection and actual/official event delivery verification. App-level setup success is not evidence of customer data reception. No customer comment, message or reply was sent, and the app was not published.

### Supplemental consent callback investigation

User logged into the software and personally saved Meta supplemental consent for only Page 182945841568122. Browser returned `facebookEngagement=error`; freshly refreshed UI still showed all interaction capabilities unavailable. Read-only server check found original scopes and credential update timestamp (2026-10-08T03:29:12.709Z) unchanged, with no pending supplemental states. Browser navigation timestamps were OAuth 03:36:37Z and error redirect 03:43:49Z; these do not by themselves prove expiry or the provider failure cause. Existing callback catch discarded error diagnostics, preventing reliable attribution.

Added allowlisted callback diagnostics and request-stage/numeric Meta error-code metadata, excluding arbitrary exception text, provider messages, trace IDs, tokens, authorization codes and URLs. Observed new regression tests fail before implementation and pass after it; API build passed. Initial full-suite invocation failed because required local config variables were absent; corrected disposable config produced 241 API tests passed, 0 failed, 0 skipped. No production DB used. Actual OAuth failure cause remains pending a fresh, user-approved consent attempt with deployed diagnostics; do not claim authorization/reception is working.

Diagnostic release 18efee2 pushed and fast-forwarded on the server after checking no tracked modifications. Original untracked backups preserved; previous API image retained as `social-scheduler-api:before-oauth-diagnostics-18efee2`. API build exit 0 and container recreation verified the diagnostic function present, enabled=true and original publishing/independent interaction config IDs unchanged. Public `/api/v1/health` returned HTTP 200, database ok, Redis PONG. No migration or credential replacement performed. Additional 99 web tests passed without failures/skips (340 total). Fresh supplemental flow was opened, existing-only Page selection and exact target ID verified, then stopped at final Save for the user. Cause and actual grant remain unverified until that callback.

User completed the fresh Save; callback again returned error. Filtered diagnostic was `page_not_returned`, status 400. This proves code exchange and me/accounts HTTP/data-array validation succeeded, then the selected Page/token/nonempty-tasks combined guard rejected. It does NOT distinguish absent Page, missing token, or missing tasks, and is not proof of a Meta outage or transport timeout. Meta app role list showed Andy Peng as administrator. Read-only Page access inspection showed business portfolio 461242873738416 and Andy Peng Peng with full access; the UI names alone do not establish API task output. No roles/settings were changed. Temporarily switched into the named Page to inspect settings, then clicked switch back to Andy Peng. Failed callback does not save/replace the original publishing credential. Next diagnostic must distinguish the three branches without storing/transmitting raw tokens or widening permissions.

Implemented distinct `selected_page_missing`, `page_token_missing`, `page_tasks_missing` diagnostics without changing rejection conditions. On those failures only, an optional read-only `me/permissions` query emits allowlisted Page-scope grant status values; optional-query failure cannot mask the primary rejection. No token persisted or permission requested by this diagnostic. Three new branch tests observed failing against the old combined diagnostic, then passing against implementation. API build exit 0; independent-database combined API/web suite 343 passed, 0 failed, 0 skipped. Actual missing-field reason still requires a fresh consent callback after deployment.

Deployed diagnostic release 1b8575c with previous API image retained; build exit 0 and runtime branch diagnostic verified. Immediate post-restart health JSON parse failed; fresh public health subsequently returned 200/database ok/Redis PONG. Reused the user's already-confirmed Meta settings via Continue (no additional permission or asset selection). Real callback failed with `selected_page_missing`: all seven allowlisted Page permissions reported granted by me/permissions. This localizes the failure to target omission from me/accounts, not missing requested scopes or transport timeout.

Meta official Postman collection documents direct Page-token lookup by an already-known Page ID: https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api?entity=request-23987686-0b79260c-96bd-49de-875b-6076213785fc . Official SDK Page fields include permitted_tasks: https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/page.py . Added fallback only when listing has no target, fetching id/access_token/permitted_tasks for original Page ID and retaining nonempty tasks, debug-token app/PAGE/scopes/identity validation, original-scope preservation and CAS. Wrong Page ID remains rejected. Initial new fallback tests observed RED then GREEN; API build exit 0. Independent read-only review found no Critical/Important issues; minor test suggestions addressed with final identity-call assertion and empty permitted_tasks rejection test. Focused gateway suite 11 passed. Parallel full suite 344/345 passed with existing Facebook reception FK conflict from overlapping fixed Page ID 100 fixtures; serial full rerun 345 passed/no skips before the final added characterization test. Fresh post-test-adjustment full suite pending. Actual fallback/live grant remains unverified until deployment and new callback.

Fresh post-adjustment serial full suite: 346 passed, 0 failed, 0 skipped. Serial execution avoids shared synthetic Page-ID fixture collisions; the initial parallel FK failure above is retained in this record rather than hidden. No production DB used. Compatibility fix is ready for deployment, but live success is not yet confirmed.

### Correction of unsupported direct-Page task lookup

Release 77ae07c was deployed; live callback rejected at selected_page with provider code 100. The preceding claim that permitted_tasks is an SDK Page readable field was incorrect: it is a POST agencies parameter, not a Page Field. Read-only provider probes on the existing Page credential confirmed both id,permitted_tasks and id,tasks return code 100/field_unavailable, while id,access_token returns 200 with matching identity and a token present. No secret or raw provider payload was printed. Subsequent review confirmed the field mistake. The official direct-token lookup does not by itself establish current tasks; do not fabricate or bypass the existing task guard.

Removed the unsupported fallback and its invented task-response fixtures, retaining fail-closed listing/task validation and all original app/Page/scope/CAS checks. Added an optional read-only debug_token diagnostic for the fresh user token on missing-Page failures. Only allowlisted token type, boolean validity/app-match, and selected/excluded asset-target classifications are retained; actual IDs, tokens and provider messages are discarded. business_management is inspected only if already present in me/permissions; it is not added to requested OAuth scopes. Optional diagnostic failure cannot mask the original failure. New regression observed RED before implementation and GREEN afterwards; focused gateway tests 10 passed and API build exit 0. Fresh independent-database serial full suite: 345 passed, 0 failed, 0 skipped. Deployment/live association checks pending.
