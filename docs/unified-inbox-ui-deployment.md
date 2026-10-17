# Unified inbox UI release — 2026-10-17

## Scope

Approved compact green three-column layout: interaction list, conversation, customer profile. Permanent top tabs: 评论 / 私信 / @提及. Platform/account filters, scoped customer search, tags, internal notes, public replies, collapsible secondary controls, mobile list/detail navigation.

Administrator-only UI and API protection remain. No permissions requested or review submitted. Runtime `policyVerified=false` remains closed; unsupported adapters stay disabled. Production does not receive synthetic QA data. Existing publishing permissions, encrypted credentials, schedules and Worker are outside the change scope.

## Local verification

- Full suite: 658 passed, 0 failed/skipped (delivery run, 184593 ms).
- API and web production builds passed. Final CSS-only adjustment prevents shared button font styles from breaking compact mobile icon buttons.
- Real browser with isolated synthetic API: desktop/mobile, 25-account selection, label and internal note save, no note sent as public reply, unknown-send duplicate prevention, partial failure warning, mobile reload recovery, and ordinary-user denial.
- Presentation regression tests observed failing before implementation and passing afterward. Mobile recovery originally failed in browser, then passed after fix.
- Independent read-only UI review found no critical/important issue; minor mobile retry finding was reproduced and fixed.

## Deployment procedure

Existing Tencent TAT channel, same Lighthouse server. Build API/web only; apply two additive inbox migrations via API entrypoint; `up -d --no-deps` for API then web. No Worker, database, Redis or reverse-proxy restart. No paid resources enabled.

Release directory: `/opt/social-scheduler-releases/unified-inbox-ui-20261017`. Preserve old API/web image tags for rollback. HMAC-protected all-workspace snapshots compare accounts/credentials, schedules, publish jobs, posts, variants, OAuth state/links and Facebook management records before/after. Environment file hashes and protected container identities/start times must match. Snapshot outputs contain counts and HMAC only, not credentials or customer content.

## Cloud verification

- Deployed code: `b6df277f6e9d9bcf9a5f7477c71d695240478c84`.
- Prepare invocation `inv-ja19x20n21`: success; build completion `inv-ia1a09gt42`: exit 0, API and web images built.
- First activation `inv-ia1a0x0re2` hit a deployment-check environment error (host Node absent); automatic API/web image rollback succeeded. Check was corrected to use container Node rather than installing any host dependency.
- Final activation `inv-ia1a1g0rgh`: success, exit 0, 2026-10-17 10:41:47 UTC.
- API health: `ok=true`, database `ok`, Redis `PONG`; `/inbox` returned success. Public inbox JS hash matches container bundle `page-4f50a84f7010cf05.js`.
- Both additive inbox migrations applied; new assets/cases both 0. No synthetic QA records imported. Runtime policy gate confirmed closed in deployed API.
- Unauthenticated GET accounts/cases/customer/tags and POST refresh/replies/tags all return 401; GET responses retain `Cache-Control: no-store`.
- All nine all-workspace HMAC snapshots match exactly: 26 accounts plus encrypted credentials, 2413 schedules, 2413 publish jobs, 543 posts, 2413 variants, 183 OAuth states, 80 authorization links, one Facebook management connection and one page selection.
- Both environment file hashes unchanged. Worker/container ID and start time unchanged (`3cbc3bed…`, `2026-10-13T06:01:58.401954871Z`). PostgreSQL, Redis and reverse-proxy container IDs/start times also unchanged.
- Only API/web containers replaced; old images retained as rollback tags. No added cloud services, paid acceleration or new infrastructure.

Public unauthenticated smoke tests and bundle identity checks do not claim a real administrator login or live provider interoperability; provider activation remains a separate explicitly authorized step. Desktop/mobile layout and administrator denial were exercised locally against isolated synthetic API responses, not live customer messages.
