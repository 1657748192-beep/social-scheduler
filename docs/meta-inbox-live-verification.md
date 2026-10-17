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
