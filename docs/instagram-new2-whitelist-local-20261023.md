# NEW2 independent whitelist — local verification

## Approved scope

User selected the minimal NEW2 whitelist, explicitly rejecting manual attestation and a ten-minute gate. Only local implementation/tests are authorized: no Meta account requests, deployment, send, service restart, counter reset or Webhook enablement. REC3 stays closed. Existing unrelated dirty documents/output are preserved.

The preceding read-only diagnosis established that NEW2 already exists in the inbox, but the recording selector falls back to REC1 and rejects it before provider dispatch. The normal reply path does not depend on REC3 full-history qualification. This change does not relabel partial history as complete.

## Implementation decisions and sequence

- Add optional `messageNew2` to the existing strict recording schema, binding source row/provider event/actor/conversation/expiry alongside unchanged asset/connection/admin boundaries.
- Select only this configured NEW2 while it is present. Keep all old configuration fields and read evidence; do not admit old records for new sends or construct a REC3 grant.
- Use the existing fixed payload `Social Scheduler Instagram reply test NEW2. This reply is for app review demonstration only.` and `SS-IG-DM-NEW2` marker boundary check.
- Keep the existing normal ownership/permission/window checks and unchanged durable single-target executor, receipt presentation and replay behavior. Any earlier attempt for the same actor consumes the existing slot, regardless of new request key or status; no rearming.
- Enforce configured expiry AND original inbound plus 24 hours (including equality), and show the earlier deadline in detail. No manual evidence, new ten-minute window, schema migration, UI replacement or background service changes.
- TDD: new behavior fails first, minimal parser/selector/fence change, normal flow + expiry + concurrency/outcome/identity tests, existing REC3/Graph/Web regression, API build and unfiltered full regression, independent read-only review.

## Evidence

`output/ig-new2-whitelist-red.log`: eight NEW2 scenarios failed because the old strict parser rejects `messageNew2`; legacy tests continued to pass. `output/ig-new2-whitelist-green.log`: 37/37 passed after minimal whitelist implementation.

`output/ig-new2-deadline-red.log`: the new advertised-deadline test reproduced the configured-expiry overstatement. Corrected the NEW2 detail deadline to the earlier configured/original-24h value without changing the executor or Graph module.

Final focused tests, full suite, build and review are pending actual results below. A first focused command referenced a nonexistent `instagramReplyGrantRecording.integration.test.ts` and stopped at test startup; corrected to the existing GrantSend/GrantReceipts files. No test result was claimed from that startup failure.

## Focused gates and independent review

Final focused regression: **91/91 PASS**, no failures/cancellations (`output/ig-new2-focused-final.log`), including Graph completeness, REC3 ops/send/receipts and Web recording components. API `npm.cmd run build --workspace apps/api` exited 0 (`output/ig-new2-api-final-build.log`). Production changes remain only `replyRecording.ts` and `engagement.ts`; executor, Graph, schema, Web and deployment configuration are untouched.

Fresh read-only reviewer `new2_whitelist_review` inspected the scoped uncommitted diff against `55d930d`. No Critical/Important issues; minor test gaps were coexistence with closed REC3, same-actor source/config replacement after consumption, and expired detail admission. Added coverage for all three. The coexistence fixture initially violated the real database's SHA-256 key constraint (`ig-new2-boundaries-final.log`), then only its synthetic key was corrected; no constraint or production behavior was weakened. Final boundary/recording run **41/41 PASS** (`ig-new2-boundaries-green.log`). Expired sources are blocked by existing retention before any sendable detail is exposed.

Reviewer declined live provider/configuration/deployment/policy behavior and running builds/tests. Parent independently ran the local gates; live actions remain expressly unauthorized and were not performed. Unfiltered full regression is still running; do not claim its outcome yet.

## Final local results

Unfiltered full suite completed: **1295 tests, 1294 PASS, 1 FAIL, 0 cancelled**, exit 1 (`output/ig-new2-full.log`). All 12 NEW2 scenarios passed in this full run. The sole failure was unchanged `interrupted video resumes into one schedulable asset without changing old bindings, scopes or schedules` (`localUploadEndToEnd.integration.test.ts:42`): initialization returned capacity-protection HTTP 507 instead of 201. It does not touch the modified Instagram modules. The real upload gate requires 2 GiB free plus reservations, and the default C: temporary volume was close to that floor.

Without changing code, assertions or capacity thresholds, reran the entire failed upload test file with task-local TEMP/TMP on D: (`D:/CodexTemp/ig-new2-20261023`), a fresh isolated test DB and the existing local Redis: **2/2 PASS**, exit 0 (`output/ig-new2-upload-environment-recheck.log`). Test-owned temporary files and isolated databases were removed by their fixtures/wrapper. This supports an environmental-capacity failure; the original unfiltered run is NOT represented as green, and there was no second unfiltered full run.

`git diff --check` on all three changed code/test files exited 0. Production diff is exactly the two Instagram files listed above. No Web, schema, migration, dependency, send executor, pagination completeness, deployment or Worker change. No live/Meta requests, live writes, send, restart, counter reset or submission occurred in this implementation turn. No NEW2 runtime configuration was enabled. REC3 and Webhook remain untouched/closed; deployment and live target binding still require separate user approval.
