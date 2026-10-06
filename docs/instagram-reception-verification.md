# Instagram reception verification

## Local status

The reception implementation is not yet deployed or accepted against real Meta delivery. The direct Meta empty-list condition remains external and unresolved. No customer reply or Meta publication/review submission has been performed.

- Disposable PostgreSQL: `codex-instagram-reception-test`, bound only to `127.0.0.1:55436`, database `reception_test`.
- New store integration exercises concurrent duplicate writes, process-independent dedupe, scoped thread access, pagination, outbound echo behaviour and strict retention cutoff against PostgreSQL.
- Final configured suite after review fixes: 253 passed, 0 failed, 0 skipped.
- API/web production build passed. Prisma schema validation and `git diff --check` passed. Existing Next.js multiple-lockfile/workspace-root warning remains unchanged.
- Initial suite failures were missing fixture environment configuration; the initial store concurrency test caught an emulated upsert race and passed after conflict-safe insertion was implemented.

## Test commands

Use only local fixture URLs for `INSTAGRAM_TEST_DATABASE_URL` and `SANDBOX_TEST_DATABASE_URL`. The general `DATABASE_URL` is a separate dummy URL for dependency construction; integration fixtures must never target a production database.

```powershell
npx tsx --test apps/api/tests/*.test.ts apps/web/tests/*.test.ts
npx prisma validate --schema apps/api/prisma/schema.prisma
npm run build
git diff --check
```

## Deployment and rollback

Apply the additive `20261006000000_instagram_reception` migration before running the new API/worker. Deploy API, web and worker together without replacing publishing tokens or changing provider publishing configuration. Keep a recoverable database backup and existing image references. Verify API/database/Redis health, authenticated scoped reads and receipt status after rollout.

If reverting application code, keep the new tables and content intact. Do not run a migration reset, drop tables, or delete customer messages as a rollback step. The prior application ignores these additive tables.

## External acceptance checklist (not completed)

1. Confirm Meta callback is saved, required comment/message fields subscribed, and app delivery state permits notifications. Server readiness alone does not prove this.
2. Send one new comment and one new inbound message from an authorized tester after delivery is connected.
3. Observe valid signed receipt, increasing account revision and visible received content in the matching workspace.
4. Only with explicit user authorization, send a manual reply and verify receipt; do not automatically message customers.
5. If Meta still returns empty API results or blocks notifications, record that failure separately. Software implementation success is not end-to-end delivery success.

## Privacy

Store identifiers, text and bounded attachment metadata only, without downloading image/video binaries. Default rolling content retention is 90 days, daily cleanup is bounded. No raw payloads or credentials in reception logs. Account deletion cascades to its stored reception records.

## Independent review rulings

All seven important findings were reproduced with failing tests and fixed: newest-first local history and reply-window metadata; composite provider/local pagination; initial revision refresh and retry after failed refresh; non-sliding status cache expiry; visible message-level provider errors; independent comment reads when metrics fail; and persisted outgoing replies for live-only conversations. Reconciled local conversations also verify newer live inbound messages before determining the reply window. Final full tests and API/web builds passed after these fixes.

Source labels and not-requested provider status were corrected as part of the pagination fix because truthful read provenance is part of its correctness.

Two minor findings are deferred: ignored webhook events can still increment the processor's received counter (database revision remains authoritative); visibility and stale-request guards are not rechecked at every asynchronous boundary, allowing an extra read or transient stale loading state. Neither is evidence of real Meta delivery success.

The reviewer did not establish real Meta delivery, production rollout/performance, or production deletion acceptance; these remain external acceptance work. Unrelated TikTok documents were excluded. Full-suite verification is the implementer's fresh run, not an independently repeated reviewer run.

Commit/push/deployment remain pending Git author identity. No production migration has been applied.
