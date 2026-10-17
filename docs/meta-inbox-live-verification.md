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
