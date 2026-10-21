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

Not deployed yet. API/web operational scripts preserve actual environment, mounts and test restriction, build revision-labeled images, provide API/web rollback without Worker, and verify only the existing already-sent reply through read operations and scoped protected-state equality. Shell/embedded Node/Python syntax checks passed.
