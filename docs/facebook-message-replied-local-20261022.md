# Facebook message replied badge — local verification

Scope: local source and tests only. No deployment, service restart, Meta request,
permission change, credential update, schedule update or review submission.

## Rules

- A successful, nonempty provider receipt must belong to the exact current managed
  Page, connection, workspace, app, grant epoch and message recipient.
- The original receipt occurrence must follow the latest known inbound. Copied
  receipts from controlled retries cannot establish a newer reply, even when the
  copied row belongs to a new grant epoch.
- Pending, failed and unknown attempts do not establish a reply.
- Detail presentation also considers inbound timestamps in the already obtained
  adapter response, without another provider request or a case write.
- Manual processing status and all send/idempotency protections are unchanged.

Timing is intentionally conservative: the cutoff uses original attempt admission
time, not mutable `updatedAt`. An inbound arriving while the original send is in
flight can leave the badge unreplied even if that send subsequently succeeds.
This avoids claiming that a new inbound was answered based on an old receipt.

## Verification

- Affected baseline: 14/14 passed before changes.
- New regression tests first failed on genuine message receipt and fresh detail
  inbound behavior, then passed after implementation.
- Focused API and existing web detail regression: 17/17 passed.
- Read-only code review: no critical or important findings; conservative in-flight
  timing limitation documented above.
- Full `npm test`: 1,147 passed, 0 failed, 0 skipped (644.4 seconds).
- `npm run build`: API TypeScript and web production build both passed. Existing
  Next.js multiple-lockfile workspace-root warning remains; no dependency change.

The deployed application is unchanged; these results do not claim live validation.
