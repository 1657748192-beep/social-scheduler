# Meta unified inbox live integration verification

Plan: `docs/superpowers/plans/2026-10-17-meta-inbox-live-integration.md`.
Spec: `docs/superpowers/specs/2026-10-17-meta-inbox-live-integration-design.md`.

## Boundaries

Facebook Factory Wholesale and Instagram mooyamcosmetic are user-selected test names, not yet verified production asset IDs. No production/provider changes, OAuth consent, subscriptions, actual sends, deployment or review submission performed by this implementation stage.

Publishing credentials, original OAuth flows, permissions, schedules and Worker remain out of scope. New independent interaction policies default closed. Synthetic rules in test helpers are explicitly labeled `synthetic-test-only` and cannot be treated as policy review evidence.

## Baseline

Before changes: 658 passed, 0 failed/skipped, 167701.5956 ms (`meta-inbox-baseline.log` in local task tools directory). Existing unrelated dirty verification docs and ignored QA outputs were preserved.

## Task 1 — policy and provenance

- Added strict platform/app/workspace/asset policy matching with independent read/send gates; missing, unreviewed or future-dated evidence denies. Malformed configuration errors do not echo configuration values.
- Discriminated Facebook/Instagram sources reject mixed fields. Legacy untagged Facebook is accepted only at an explicitly Facebook boundary. Instagram lifetime resolution fails closed pending its independent source store.
- Observed behavior RED: missing asset rule did not stop existing access service before provider verification; Instagram source touched Facebook source lookup; Facebook adapter accepted another platform carrying forged Facebook fields. Covered by new tests, then corrected.
- First focused run: 12/12 passed; after adding adapter isolation regression: 13/13 passed. API TypeScript build passed.
- Existing comment-detail fixture lacked a platform field; updated fixture to carry the actual Facebook asset platform instead of weakening the new guard. Original customer-filtering assertion is unchanged.
- Full regression after changes: 671/671 passed, 0 failed/skipped, 184669.1729 ms (`meta-inbox-task1-full.log`). `git diff --check` passed. Existing React test-renderer deprecation warnings remain; no assertion failures.

## Activation / real acceptance

Not started. No official policy evidence, real grants, Webhook delivery, sending, or platform receipt has been inferred from local tests. Both platforms must separately pass the approved acceptance checklist before recording-readiness is claimed.

## Task 2 — independent Instagram storage

- Added connection/OAuth state, raw events, message/comment sources, independent send attempts and deletion request/marker models. Only InteractionAsset gains an optional independent Instagram link; original publishing tables/records are not rewritten.
- Captured missing independent model RED; then model tests4/4 passed. Test applies actual Prisma migration to the validated isolated DB while original account credentials, post, schedule and publish job rows exist, and compares full protected snapshots afterward.
- Composite workspace/app/asset constraints reject foreign connections; same provider event/actor ID in different apps/platforms stays separate. Correctly scoped Instagram asset insertion succeeds, so negative tests do not pass merely because all inserts fail.
- Full suite675/675 passed,0 failed/skipped,190363.3113ms. API build exit0, diff check passed. Migration SQL reviewed: only eight new interaction tables and InteractionAsset altered; no old publishing DML/DDL. Generated Prisma client was refreshed locally, no dependency changes.
- Ruling: keep independent-account deletion cascades compatible with a future explicitly requested original-account unbind; Task7 must purge orphaned covered customer notes/identities as part of deletion lifecycle before real activation. Shared type module deferred to Task3, its first consumer; no unused aliases added.

## Task 3 — independent Instagram authorization

- Independent configuration/start/callback/status routes, hashed single-use 10-minute state, original-session/expected-account binding, safe exchange and independent encrypted grant persistence. No publishing credential read/fallback or write in the new authorization path.
- Gateway test transports verify fixed official hosts, no redirect following, actual granted scopes (no requested-scope fallback), exact owner identity, body <=1MiB, timeout signal and sanitized errors. Malformed response, unsafe numeric ID or missing actual grant fails closed.
- Focused17/17 passed before two additional exchange-failure/late-session-revocation characterizations; those10 OAuth tests pass. Authorizer-demotion-during-inspection regression observed actual missing rejection RED, then access3/3 GREEN after fresh authorizer check. API build passed. Final full suite after the fix:695/695 passed,0 failed/skipped,185305.0441ms (`task-3-final-full.log`). Diff check passed.
- New enabled config requires explicit minimal interaction scopes and same-origin dedicated callback, never publishing scope. Production config remains untouched/disabled. No external exchange or consent performed.
- Disconnect stays unavailable without its transactional deletion hook (Task7); remote subscription writes are not exposed by authorization/status GET. Existing retired engagement endpoints are unchanged.
- Official Meta-owned Postman search evidence confirms Instagram professional account/inbound-message prerequisites in the Send API overview, but the fetched page still presents a framework. This is partial documentation evidence, not full window/retention/deletion policy review or proof of this app's grant. Source: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-af579d08-121e-4897-8f45-5fd41ace49df . No live policy enabled on this basis.

## Task 4 — Facebook current-asset projection

- Extracted connection-access contract. Only explicitly permitted canonical Page assets resolve; same display name cannot enable a different Page. Fresh member/authorizer, selected Page, app namespace, connection version, token presence/expiry and required tasks are checked.
- Transactional source fencing locks existing binding/connection/Page/selection rows without changing them and without network calls inside transaction. Source-kind capabilities are checked before projection and corresponding current tasks repeated under locks.
- Behavioral RED→GREEN: changing app namespace after provider read must reject projection; Page-task revocation during provider capability fetch must reject read; omitting kind-specific transaction check reproduced unauthorized projection, then restored check passes. Seven new Facebook tests pass; focused30/30 passed before final added transaction regression, and full final suite702/702 passes,0 failed/skipped,172146.5616ms. API build and diff check pass.
- Existing management grants/selections and publishing snapshots remain unchanged during real service calls in local tests. Synthetic test setup deliberately mutates/restores its own Page metadata for race cases; these setup mutations are not production actions. Comments still explicitly cover verified software-published posts only.
- Ruling: deleted-source marker scheme and cleanup wiring remain Task7; current source-expiry/deletion filters remain. No real activation before that lifecycle is complete.

## Task 5 — signed Instagram reception

- Raw-byte HMAC verification, bounded 1MiB parsing, durable database deduplication before acknowledgement, explicit app/asset routing and rejection of ambiguous workspace mappings. API-owned nonoverlapping pump processes at most50 events/tick with lease fencing; shutdown waits for in-flight work. Worker unchanged.
- Behavioral RED→GREEN covered cross-app claim finalization, oversize error stack leakage, actual app callback mounting and expired raw data becoming fresh source. OAuth callback now sends no-referrer, verified with an initially failing HTTP assertion.
- Final focused18/18, full719/719 passed,0 failed/skipped,184818.2568ms (`task-5-full.log`). API build exit0 and diff check passed. Existing React test-renderer deprecation warnings remain.
- Independent source receivedAt preserves raw receipt time; completed raw events lose their body. Unknown/future inbound timestamps do not start a fresh reply window. Opaque local thread keys are not Graph conversation IDs.
- Default runtime deliberately supplies no deletion guard until Task7; receiver remains closed. Local signed fixtures are not evidence of real Meta delivery, verified grants or policy compliance. No production/provider operations performed.

## Task 6 — guarded Instagram reads and manual text replies

- Fixed-host bounded Graph transport and contextual cursors; independent engagement/adapter verifies exact source/account/connection/version, actual grant and current owner before reads or replies. No publishing credential fallback. Subscription mutation remains deliberately unavailable pending explicit verified live configuration.
- Source bodies remain in independent message/comment tables; normalized projection items contain references only. Remote reads verify own media/thread and actor mapping, preserve original source timestamps, reject future/unknown/too-old remote records, and cannot revive a deleted source. Signed local thread keys are not sent to Graph as provider IDs.
- Text-only replies use a server-side policy window from actual inbound sources, explicit recipient ownership, bounded comment limits and a single persisted request key. Unknown dispatch results are terminal; same key/payload does not call the provider again. Late success after disconnect remains unknown.
- Behavioral RED→GREEN covered foreign targets, missing scope, expired window, lookup/send revocation, pagination loss/continuation, source platform forgery, messages-only versus comments-only grants, in-inspection scope revocation, own business-user aliases and dot-segment IDs. Focused31/31 passed; API build exit0. Final full suite747/747 passed,0 failed/skipped,195694.6253ms (`task-6-full.log`); diff check passed. Existing React test-renderer deprecation warnings remain.
- No runtime registration, actual token inspection, subscriptions or real sends were enabled. The official Meta messaging/deletion pages were rechecked on2026-10-18 and again returned429; comment-moderation page was inaccessible. These requests do not constitute readable policy evidence or permission approval.

## Task 7 — source-deletion checkpoint (not complete)

- Added interaction-only migration004 for encrypted purge locators, idempotent request keys and bounded retry metadata. Observed unknown-locator-field RED, then applied actual migration to the isolated test database with protected original publishing records present; model tests5/5 passed and snapshots remained equal. Applied003 was not modified. An invalid test subjectKind was corrected to the existing item contract, not by relaxing database constraints.
- Internal Instagram admission records namespace HMAC markers and encrypted jobs atomically. Connection disconnect blocks the old version and old event timestamps; publishing credentials are not changed. Item hashes distinguish comments/messages and app/workspace/asset; source subjects now explicitly carry event kind.
- Bounded source purge removes at most50 scanned raw envelopes or source bodies per call, persists an encrypted continuation and leaves newer connection versions/other actors untouched. Marker replay regression verifies that a signed old event cannot recreate removed content. A same-ID comment/message regression initially failed, then passed after explicit event kind propagation.
- Source purge is not full deletion: receipts deliberately remain pending. Derived cases, customer identities/notes/tags, retention rules, Facebook mapping, app-user callback admission and API maintenance registration are still pending. The new router and service are not mounted or activated in production.
- Focused source/receiver/adapter31/31 and API build exit0 passed. Full checkpoint regression760/760 passed,0 failed/skipped,216269.1759ms (`task-7-source-checkpoint-full.log`); diff check passed. Existing React test-renderer deprecation warnings remain. No deployment/provider operations or Worker changes occurred.
