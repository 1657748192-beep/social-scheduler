# Facebook comment reply display — 2026-10-21

## Authorized bounded scope

User approved correcting existing comment reply reads/display, automatic detail refresh after confirmed send and a replied indicator, followed by API/web deployment only. Preserve existing publishing permissions, credentials, schedules, Worker and deletion protections. Never resend the consumed test reply or submit review. Reuse the existing linked worktree; unrelated dirty documents remain untouched.

## Diagnosis and implementation

- Read-only production invocation `inv-ga6eeugu38` confirmed exactly one sent attempt for `SS-FB-C-1021-REC`, official reply body/parent correct, but inbox detail returned only the parent and case workflow remained pending. This was missing thread retrieval, not provider send delay.
- Provider reply pages use the verified parent's `/comments` edge, preserve cursor and authoritative minimal bodies, with optional author enrichment. Management reads verify the owned published post and selected parent before accessing child replies. The restricted test still permits only the original Page/post/current comment; no OAuth scope or subscription changes.
- Adapter exposes parent and verified child replies, checks each item against deletion markers/current epoch and retention, and identifies outgoing Page replies. If optional author metadata is absent, only an exact current Page/connection/version/workspace/app/parent successful provider receipt can establish outgoing direction. Bodies are read live, not copied into persistent inbox indexes.
- A read-only `replied` flag uses scoped successful receipts for this parent/current epoch, not failed/unknown sends. Manual workflow state remains separate and unchanged (replying is not automatically resolving a work item). New child replies are context, not newly projected unread events; the indicator establishes a confirmed reply exists rather than asserting all future follow-ups are handled.
- Web detail and list show the replied indicator; confirmed sends increment the same-case detail revision and refresh the list. Failed/unknown sends do not fabricate reply bodies or trigger another send. Existing scope cancellation continues to prevent late responses from restoring another account's state.

## Test-first and review evidence

- Initial new tests exposed missing provider/management reply methods, missing replied property and missing post-send detail reload. The first adapter fixture had a non-UUID schedule, corrected before its meaningful RED; disabling reply inclusion then produced the expected parent-only versus parent+reply failure. An additional empty first-page fixture exposed parent-detail dependence on the first root page, corrected by using the parent-verifying thread reader.
- Optional-author regression observed RED (`inbound:true` rather than false), then scoped receipt correlation passed. Pagination-budget regression observed a404 where503 was required; incomplete scans now return503, completed absence remains404.
- Focused final run before budget extension passed19/19, including UI scope cancellation, same-case input preservation, actual database reply direction, deleted-reply exclusion and successful receipt badge without changing workflow status. Final full suite and builds are recorded below when complete.
- Independent code review initially found optional-author direction and incomplete-parent-pagination errors; both corrected and re-reviewed with no further critical/important findings. Operational review also corrected ERR trap inheritance and semantic restriction comparison. No reviewer ran parallel database tests or performed mutations.

## Deployment status

Final isolated full `npm test` passed1102/1102, zero failures/skips, exit0, 563766ms. API final build and web production build both exited0. Existing react-test-renderer deprecation warnings remain. No parallel database test command ran during this full suite.

Deployed source revision `b687d8c19b57bebdef40286073f2cb005b23bd3b`. Shell/embedded Node/Python syntax checks passed.

- Image preparation invocation `inv-ha6f0k0vm4` succeeded exit0 on2026-10-21 16:32:40–16:34:04 Beijing. Built API/web images, no runtime restart or send during build; disk guard and unchanged runtime/environment checks passed.
- Activation invocation `inv-ia6f2kgsx6` succeeded exit0 at16:34:49–16:35:05 Beijing. API and web switched to revision-labeled images; actual environment/mounts/commands/pinned recording restriction unchanged, direct API command without migrations. One initial502 during replacement recovered through health checks. No rollback needed.
- Live existing administrator context verified the already-sent `SS-FB-C-1021-REC` reply: parent visible, reply visible, exact official reply ID/body/parent match, outgoing direction, replied flag true in detail and list. Exactly one existing sent attempt, unchanged. No send operation invoked. Manual case workflow remained unchanged, private-message restriction remains closed.
- Scoped publishing credential, independent Page/connection, selected Schedule/variant/jobs, deletion markers and all Page send attempts HMAC matched before/after. Worker/Postgres/Redis/proxy identity/image/start time and environment-file digests unchanged. Unauthenticated inbox access still401. API and web public health/page checks succeeded. No review submission.
- Web real-component regression verifies successful sends refresh detail without another send. No browser screenshot acceptance claimed; user should reload the existing browser page to fetch the new web bundle. The original comment has already been replied to and must not be resent for demonstration.

## REC2 after user-completed authorization — pending external rate limit

- User posted `SS-FB-C-1021-REC2` and personally completed management OAuth, then authorized selecting its newly granted Page connection and preparing the unused single-use entry without sending.
- Read-only plan `inv-ia6fbp0p9g` succeeded16:44:31–16:44:35 Beijing: completed new authorization, original app/workspace/user, Factory Page present, new connection/current epoch, original published binding unchanged, exact unique new comment and no prior target attempts/reply. Old Page selection still active. Metadata remains private on server in `factory-rec2-after-auth-20261021`.
- Preparation `inv-ja6fd7gee4` succeeded16:46:07–16:46:09. Same API image/config/mounts, changed rule limited to managedPageId/connectionId/connectionVersion/commentId, retaining fixed text digest and expiry2026-10-22 15:14:19 Beijing.
- Activation `inv-ja6fdigtfc` stopped at provider read and restored prior API plus prior selection healthy (16:46:29–16:46:39). Only API was recreated; Worker/web never restarted. No send. Derived refresh/list/detail stages were not reached; entry is NOT activated.
- Read-only diagnosis `inv-ha6fei0d7g` confirmed target still present with exact marker, no local tombstone. `inv-ga6ff20bxc` established new grant active/unexpired/current version, but canonical Page token inspection returned rate_limited. Delayed minimal grant check `inv-ga6fgigng5` at16:49:41 confirmed MetaHTTP403/code4, no Retry-After; no bypass or permission changes. Root comment reads still worked, but token inspection could not safely admit the new grant.
- Recovery audit `inv-ia6fhe02e2` succeeded16:50:37–16:50:39: prior API image/environment/command and selection restored; scoped publishing credential/Schedule/variant/jobs, both old/new management grants, subscription, relevant deletion markers and all Page send attempts HMAC unchanged. REC2 target attempts0; Worker/web/infrastructure identities unchanged, API healthy. No review submitted. Stop further Meta calls pending rate-limit recovery; no automatic monitor was scheduled and no recovery time was claimed.
