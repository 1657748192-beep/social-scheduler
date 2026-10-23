# Instagram REC3 — local implementation verification

## Authorized scope

Local implementation and tests only. No production deployment, migration, Meta request, actual comment/message send, service restart, credential/permission/schedule change, attempt reset or review submission. Webhook remains outside this change and is not enabled.

Spec: `superpowers/specs/2026-10-23-instagram-rec3-single-reply-design.md`.
Plan: `superpowers/plans/2026-10-23-instagram-rec3-single-reply.md`.
Implementation base: `b710cd07f568b3955a1513146e601ed7bfc2cc97`.

## Implemented boundaries

- Stable provider-message identity, unique persistent grant and immutable active binding. Additive migration only; no old attempts migrated or rewritten.
- REC3-specific maximum age of 86400000 ms, capped further by the existing policy and configured deadline. Rechecked before dispatch.
- Connection/grant serialization and atomic original-attempt creation. Repeated keys/executors/tabs cannot create another attempt or resume a committed claim.
- Failed/unknown/abandoned claims remain consumed. Receipt persistence faults leave a durable claim, not a retry queue.
- Original grant-bound receipt, right-side confirmed feedback and reload guidance. The REC3 reserved payload cannot mark arbitrary later messages replied, including ambiguous equal timestamps.
- Scoped scrub/close in existing lifecycle budgets; closed identity retained until fixed safe expiry, then removed without re-enabling an aged original message.
- Explicit operations default dry-run. Read permits only scoped Graph GETs, max 10, no redirects/retry; incomplete pagination, duplicate candidates and rate limits stop preparation. Signed fresh evidence and protected state fingerprints are required for apply. No send operation exists in these tools.

## TDD evidence

- Task 1: identity/model missing RED, then 2/2 GREEN.
- Task 2: preparation missing RED, then new and unchanged recording tests 40/40 GREEN; independent preparation run 11/11 GREEN before added bare-marker case.
- Task 3: zero dispatch/absent claim RED, then 16/16 GREEN; post-claim age boundary RED→GREEN, 9/9; simulated receipt transaction failure retains the consumed claim.
- Task 4: used-vs-available and missing UI guidance RED; canonical cached outbound fixture corrected to existing customer-normalized actor identity. API/UI/legacy combined regression 66/66 GREEN.
- Task 5: absent lifecycle and missing bounded close RED, then lifecycle + existing deletion/retention tests 13/13 GREEN.
- Task 6: missing operations RED, then 4/4 GREEN; added actual default CLI, revoked-authorizer, expired-preparation tests. Active-binding mutation and bare duplicate marker RED→GREEN.
- Concentrated new regressions: 36/36 passed in `output/ig-rec3-all-focused.log` (before the additional equal-timestamp assertion within the same receipt test; that assertion has its own RED log).
- Full suite, final production builds and independent review are pending at this checkpoint; no completed full-suite claim is made here.

## Concrete implementation rulings

- Optional REC3 `recordingReply.outcome` is added so a durable pending/unknown claim remains visibly locked after page reload. Backward-compatible presentation only, not new sending authority.
- Lifecycle helpers accept optional actor/message selection or asset scope so closing one selected source does not close unrelated customer qualifications.
- REC3's fixed reserved recording payload is excluded from generic replied evidence unless the grant-bound reader validates it. This deliberately favors pending over a false replied status on ambiguous later messages; REC1/REC2 payloads and old rows are unchanged.
- Existing dependencies and isolated worktree reused; no package installation or new paid service.

## Future authorized operations (not run)

1. Verify exact tested commit, additive migration and old attempts/protected publishing HMAC snapshots. Build with REC3 disabled.
2. Obtain explicit production authorization for migration, API/Web deployment, only API restart, Worker unchanged; keep original environment and fixed REC1/REC2 records.
3. Install the reviewed operation entrypoints into the existing approved execution context. `SOCIAL_SCHEDULER_API_DIST` must point to that release's compiled API modules. Do not run development fallbacks against production.
4. Supply a permission-restricted private input file with existing rule plus only messageRec3 and the existing administrator session context. CLI rejects changed legacy fields, changed existing REC3 binding, active Webhook, unknown arguments and insecure POSIX input files.
5. `read.cjs --input <private-plan> --output <new-private-evidence>` is dry-run without `--allow-provider-read`. Explicit reads save raw evidence only to a newly created 0600 private file, never stdout. Private evidence must follow the existing content-retention/deletion rules and must not enter Git or public logs; remove it through the approved operation after use.
6. `prepare.cjs --input <private-plan> --evidence <private-evidence>` is dry-run without `--apply`. Evidence must be fresh within 60 seconds, signed, scoped and have unchanged protected fingerprints. Preparation synchronizes only the configured inbound and necessary indices, then prepares the grant. Failed preparation never sends; authorized selected source/index writes may already exist, so report partial preparation rather than claiming rollback.
7. `verify.cjs --input <private-plan>` is database-read-only: check ready/unused, original fixed text, old attempt snapshot and Worker/configuration identity without provider fetches or dispatch. Actual runtime/environment guards belong to the reviewed deployment wrapper; these CLIs do not restart containers or configure services.
8. Only the human records and clicks Send after separate explicit readiness confirmation. Do not reset old attempts, rerun unknown sends, enable Webhook or submit review.

No claim is made that the real REC3 message is currently eligible or synchronized. Real provider ID, original receipt timing, current reply window and absence of a known later official reply still require a future explicitly authorized controlled read.
