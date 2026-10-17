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

Final cloud evidence will be recorded after activation. Public unauthenticated smoke tests and bundle identity checks do not claim a real administrator login or live provider interoperability; provider activation remains a separate explicitly authorized step.
