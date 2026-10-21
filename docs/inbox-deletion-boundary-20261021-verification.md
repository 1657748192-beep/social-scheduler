# Inbox asset-deletion-boundary fix — 2026-10-21

## Approved scope

Fix Factory Wholesale's inbox list failing on protected historical records. Preserve deletion protections, original publishing permissions/credentials/schedules and Worker. Verify the user's fresh controlled comment; deploy/restart only API. Do not submit review or send a reply automatically.

## Root cause and bounded implementation

- Production read-only diagnosis in `factory-recovery-20261021-verification.md` showed old cases before an asset deletion cutoff selected by list SQL, then correctly rejected by per-case access. This caused404 for the entire list; counts also included protected rows.
- New `sourceDeletionBoundarySql` computes only the current/legacy epoch and cutoff marker digests in Node, scoped by workspace/platform/app/Page. No HMAC key is sent to SQL. The resulting predicate is applied before shared count/keyset pagination clauses. No-record Facebook cases use lastInboundAt-or-createdAt; backed Facebook/Instagram cases use raw source occurrence, not cache reception. Cutoff equality remains denied.
- Detail/per-case access, deletion markers, bodies, and source occurrence times are unchanged. No blanket404 catch or permission-error suppression. This fixes asset cutoff/epoch filtering; item/actor-specific tombstones and concurrent deletion after prefetch still retain existing fail-closed per-case validation, not a universal invalid-source-skip claim.
- Fresh real comment inspection found a second reference mismatch: the old publication stores a bare photo ID, while the received Webhook source correctly stores the canonical Page story ID. The Facebook adapter now preserves `v.postId` from already-verified engagement comments for its source reference. No historical publication ID or Schedule is rewritten.

## Tests and review

- Observed initial RED3 after correcting missing synthetic sync state: count4instead of2 and two actual404 failures. GREEN5 covers exact cutoff/both sides, counts across keyset pages, scope isolation, raw-source time, legacy epochs, and Instagram parity. Existing focused read/lifetime run passed10/10.
- Canonical-source regression initially exposed a fixture-only invalid parent PostStatus, corrected without product changes; then observed the intended RED (`200` instead of `100_201`). It checks adapter identity, real database projection/raw linkage, case resolution and unchanged publishing/raw-source records.
- Independent code review found no important/security defect in the asset-boundary fix or one-field canonical reference correction. Final isolated full regression passed1096/1096, zero failures/skips, exit0 (674780ms); this includes all six new regressions and the previously interfering tests. Final API build also exited0.
- Running a focused database test command concurrently with an existing full run exposed existing fixture-wide snapshot interference: focused failures in `asset deletion cutoff filters old and equal-time comments before counts and pagination without removing protection`, `verified canonical comment source joins its Webhook body while historical photo publication remains unchanged`, and `graphPaginationDuplicatesDoNotDuplicateCustomers`; overlapping full-run failures included `facebookAndInstagramSameCustomerNameRemainDistinct` and `igUnknownBlocksSecondKey`. They require isolated reruns, not fixture weakening or omission.

## Fresh controlled target

- User personally sent `SS-FB-C-1021` to the original Factory test photo. Initial exact full-description matching correctly stopped without mutation because only the marker was posted. Read-only shape probe confirmed exactly one marker; accepting either the requested unique marker alone or its full description avoids duplicate human comments.
- `inv-ia6d9w0fsq` succeeded: correct owned canonical post, fresh comment after deletion cutoff, no matching prior reply/attempt, can_comment=true, existing admin/session/association valid. No send, OAuth, refresh or restart.
- `inv-ga6dck0krx` confirmed an existing Webhook raw comment with correct current epoch and canonical post ID, distinct from historical bare publication ID; this is the real evidence for the reference fix.
- Operational scripts preserve actual current API env/mounts, retain rollback, allow only the new comment ID to change in the pinned rule, retain the prior fixed reply-text digest and expiry, and prohibit Worker/web changes or migrations.

## API-only production deployment and verification

- Tested source revision: `5eb539efc2531b84de36cf714ffbd131f2aa5fe9`.
- Prepare invocation `inv-ia6duc0gv7` succeeded, exit0, 2026-10-21 15:54:01–15:54:41 Beijing: API image built without service restart or database writes.
- Activate invocation `inv-ha6dvf090d` succeeded, exit0, 15:55:11–15:55:31 Beijing: only API updated/restarted, direct server command without migrations. One initial502 during replacement recovered in the health retry loop.
- Actual existing administrator context: refresh succeeded; list count1; new `SS-FB-C-1021` case detail and exact reply target verified. Old direct case remains denied by deletion protection. Other users/workspaces/Pages denied; messages remain closed under the comment-only gate. No reply sent or matching send attempt created.
- Scoped existing account credentials, independent connection/Page, selected publication Schedule/variant/jobs and deletion markers had identical before/after HMAC. API environment changed only the pinned comment ID, retaining text digest and expiry; environment files and other API settings/mounts preserved. Worker, web and infrastructure identities/start times unchanged. Derived inbox/sync rows were refreshed intentionally; no global no-database-write claim.
- Entry expiry remains 2026-10-22 15:14:19 Beijing. Browser visual acceptance and the single human reply remain pending; do not claim private-message readiness or completed recording. No review submitted.
