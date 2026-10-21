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

## Authorized single manual comment reply

- User explicitly authorized the next single manual reply validation. Invocation `inv-ha6e0xg6ac` stopped at directory creation and `inv-ha6e1bgi00` stopped at a service-name guard, both before loading the sending code; no send occurred in either.
- Invocation `inv-ha6e1v04hw` succeeded exit0 on 2026-10-21 15:59:54–16:00:15 Beijing. Existing inbox session/access, exact case and target validated; `replyToCase` sent the fixed approved text once: `SS-FB-C-REPLY-1019 评论回复验证，仅用于审核测试。`.
- Official Graph read of returned reply ID confirmed exact text and parent comment. Exactly one persisted sent attempt. Replaying the same request key returned the same receipt, with no new attempt/provider send; the logged Prisma unique-key conflict is the expected caught idempotency path.
- Scoped account/credential, independent Page/connection, selected Schedule/variant/jobs and deletion markers HMAC unchanged. Environment files and API/web/Worker/Postgres/Redis/proxy identity/image/start time checks unchanged; no service restarted or review submitted.
- Browser tab inventory showed an existing session-expired login page; binding the social-accounts tab timed out. Thus backend reply validation is complete, but current visual UI acceptance and an end-to-end fresh live-send recording are not verified. Do not resend this already consumed comment. Recording a new send requires a separately prepared new target; no such target was silently created or enabled. Messages remain closed.

## Fresh recording-only target, no reply sent

- User personally posted `SS-FB-C-1021-REC` and authorized preparing its single-use recording entry without sending. Read-only preflight `inv-ha6e5j0dpw` succeeded at16:03:51–16:03:54 Beijing: original owned post/current grant, source deletion admission, unique fresh marker, no matching reply/attempt, can_comment=true. Existing expiry and reply-text digest retained.
- Same-image preparation `inv-ha6e62gfv2`, then activation `inv-ia6e6qgiqk` met429 during refresh and restored prior API healthy. Second prepare `inv-ha6e7n0nn9`/activation `inv-ha6e7t0cnd` also restored prior API after429 persisted across a31-second wait. No sends in any operation. Each replacement briefly502 before health recovery.
- Read-only Redis diagnosis `inv-ha6e7e00h4` showed expired cooldown/no active reads. Instrumented normal refresh `inv-ja6e9306ru` under the restored rule admitted1 and completedok. No Redis protections were cleared or modified. These observations did not prove the source of competing refreshes.
- Final preparation `inv-ga6e9hgdx2` succeeded. Activation `inv-ia6e9p0pec` succeeded exit0 at16:08:15–16:08:52 Beijing using the same tested API image. Actual refresh admission returned0 with cooldown5seconds; it was not bypassed. The already synchronized new case was present in the list (count2 including retained previous record); live provider-backed detail had exact new marker, target and available comment-reply capability. No matching send attempt. Old deletion protection and foreign user/workspace/Page denial verified; messages remain closed.
- Only API runtime pinned comment ID changed, all other rule fields (including fixed text and 2026-10-22 15:14:19 Beijing expiry), API configuration/mounts, environment files, scoped publishing credentials/schedule/deletion markers, web/Worker/infrastructure identities preserved. No application code rebuild/migration, no reply, no review submission. Browser screenshot/visual acceptance not claimed.
- Recording instructions: open `/inbox`, Facebook → Factory Wholesale → comments, select `SS-FB-C-1021-REC`; record the single send of the exact existing fixed text `SS-FB-C-REPLY-1019 评论回复验证，仅用于审核测试。`, then show its reply in official Facebook under the same parent. Do not send the earlier consumed comment again. This is a comment-only entry, not private-message readiness.
