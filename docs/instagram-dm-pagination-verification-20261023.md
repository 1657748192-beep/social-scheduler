# Instagram DM pagination repair — verification ledger

## Scope and observed cause

User authorized local repair/tests followed by API/Web deployment, API-only restart, necessary Meta GET verification and selected REC3 preparation only if still eligible within 24 hours. Never send, reset old attempts, enable Webhook, restart Worker, change permissions/credentials/schedules or submit review.

Existing isolated worktree reused; unrelated dirty documents/output preserved, dependencies unchanged.

One scoped metadata-only GET (`inv-ha8v2fgkxh`) confirmed the provider's actual paging contract: first response has `messages.data` and `messages.paging`; its `next` targets the same conversation's **`/messages` edge**, with fields `id,message,created_time,from,to`, limit 25 and `after` matching `paging.cursors.after`. Prior top-level `after` on the parent conversation repeated the first page; speculative nested-field `after` returned no expected list and was rejected. These failed approaches are not retained.

The first page contained one REC3 marker with original `created_time=2026-10-23T03:14:05+0000`; at the diagnostic it was under 24 hours. This is not a complete-history eligibility proof, and the original timestamp will not be refreshed or extended.

## Narrow repair design

- Keep `messages(conversationId, after?)` and the existing scoped opaque cursor format. First page remains parent conversation + expanded message fields. Continuations reconstruct only `/<version>/<same-conversation>/messages` with flat fields and raw after cursor. Never fetch a provider-supplied arbitrary URL.
- Message paging metadata must identify the matching fixed-host/version/conversation edge and after cursor. Missing list, empty/invalid next URL, missing cursor, repeated immediate cursor, empty page with next, and ambiguous nested/direct lists fail closed. Explicit `data:[]` with no next is terminal. Non-message media/comment paging behavior remains unchanged.
- REC3 controlled reader allows precisely that selected conversation's additional `/messages` edge. Complete traversal tracks both cursor and provider-event identities, rejects cycles/duplicates, limits pages and retains the existing combined maximum of 10 actual transport calls. No signed complete evidence or qualification after partial traversal, duplicate marker or a known outgoing reply after the inbound.
- Grant identity/state/deadline, old REC1/REC2 attempt logic, payloads, permissions and receipt provenance are not modified. No schema/config dependency changes.

## Test-first evidence (in progress)

- `ig-pagination-graph-red.log`: 3 new tests failed against the old route/validation, legacy 5 passed.
- `ig-pagination-ops-red.log`: cycle and repeated-ID reads reached the budget instead of stopping early. Tightened the synthetic continuation endpoint assertion; `ig-pagination-ops-red2.log` then also failed the real signed-read traversal, rather than masking the old wrong route.
- `ig-pagination-graph-final.log`: initial 8/8 pass after repair; an unintended generic media-progress check was narrowed to messages, retaining the unchanged legacy host-isolation test.
- `ig-pagination-completeness-red.log`: blank next and conflicting nested/direct lists reproduced as accepted; `ig-pagination-completeness-green.log`: **9/9 pass** after fail-closed correction.
- `ig-pagination-ops-green.log`: **17/17 pass**, including complete multi-page read→qualification, cycles, repeated event IDs, hidden duplicate marker, hidden official outgoing and missing terminal list.
- Focused legacy/grant regression, builds, final independent review and unfiltered final full regression are not yet all complete. No deployment or readiness claim at this checkpoint.

## Independent review and one fix pass

Read-only fresh-context reviewer `ig_pagination_final_review` inspected `77deb6c..7ec6289`, without tests, network or service operations. No Critical or Minor; one Important: a nested `messages.data` with sibling outer `paging` could hide a continuation and sign incomplete evidence. Confirmed via graph and operations failures (`ig-pagination-review-graph-red.log`, `ig-pagination-review-ops-red.log`), then rejected this ambiguous envelope without dropping either continuation. Post-fix graph **10/10 PASS** and operations plus legacy invitation lifecycle **22/22 PASS** (`ig-pagination-review-graph-green.log`, `ig-pagination-review-ops-green.log`). No second reviewer or expanded functional cleanup.

The reviewer set aside live operational eligibility and running tests/builds. These remain independently gated by actual final outputs and the later authorized controlled read, not assumed from static review.

Legacy/grant/receipt focused run: **59/59 PASS**, `ig-pagination-focused-final.log`. API final build and Web final build exited 0; final-source API build `ig-pagination-api-verified-build.log`, Web `ig-pagination-web-final-build.log` (Web production source unchanged).

The first unfiltered regression again exposed unchanged `expired candidates are unreadable before bounded cleanup, which does not extend retention`. Its global LIMIT 1 could select an older synthetic fixture instead of one of the test's two rows. Ruling: drain only pre-existing test maintenance backlog in bounded batches **before** creating the measured two rows. Keep all existing limit=1, remaining-candidate and immutable-retention assertions unchanged; no production cleanup code modified. This makes the fixture independent of UUID ordering and earlier completed tests in the isolated test database. The final full regression was restarted after this and the review fix; result pending.
