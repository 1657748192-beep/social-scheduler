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
