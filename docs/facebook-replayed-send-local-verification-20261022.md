# Controlled Facebook send: historical-result notice

## Approved bounded change

Keep duplicate-send admission and all historical attempts/receipts. A reused successful controlled-test result must clearly say that this call did not send a new message. Prepare a distinct fixed recording reply instead of clearing attempts or relaxing the guard. This iteration is local changes and tests only; no deployment, service restart, Meta request, review submission or live reply.

## Implementation

- The restricted executor adds optional `replayed: true` to successful results returned from the historical-payload admission branch or restricted same-request-key recovery. Fresh sends have no replay flag. Failed/unknown states remain unchanged, with no automatic retry.
- The flag propagates through existing inbox/management response types. No schema migration, permission/configuration change or publishing code change.
- Unified inbox notice: `此前已发送，本次未重发。` / `Previously sent. Nothing was resent this time.` The existing fresh-send confirmation remains only for actual fresh outcomes.
- Legacy Facebook management notice uses the same distinction. Detail reload still verifies provider data; the UI does not fabricate another outgoing message or mark a new inbound replied based on the reused receipt.
- Ordinary sends without the controlled restriction keep their previous idempotency result shape; this fix does not broaden normal/customer behavior.

## New fixed recording reply candidate

`Social Scheduler Messenger reply test REC2. This reply is for app review demonstration only.`

Local integration tests prove that a rule with only this new text hash admits one fresh send, rejects the old text, blocks a second dispatch of the new text, and keeps previous attempts. Production consumption of this candidate must be checked read-only before activation. Do not ask the user to send this text yet: the live restricted rule still accepts the old approved text until an explicitly approved deployment/configuration activation.

When activation is approved, preserve all rule fields other than its approved text hash, including user, workspace, original app, Page, current connection/version, conversation/participant and expiry. No expiry extension or new authorization is implied. Do not send on the user's behalf.

## Evidence

- Reused existing isolated worktree `codex/tiktok-sandbox-metrics`; unrelated dirty documentation and generated/untracked files retained.
- Fresh affected baseline: 12/12 passed.
- RED: both new executor regressions failed because `replayed` was absent; real detail UI test failed because it displayed the fresh-send confirmation. Legacy notice regression also failed before the change.
- GREEN focused run: 28/28 passed, 0 failed/skipped/cancelled (7722 ms), including prior unknown/failed/idempotency and authorization tests.
- Additional assertions cover concurrent controlled replies, controlled failed/unknown outcomes and unchanged unrestricted behavior. English Messenger rendering is covered with the real composer; bilingual UI/notice run passed 10/10.
- API and web builds both exited 0. `git diff --check -- apps/api apps/web` passed (line-ending warnings only).
- Independent read-only review found no Critical/Important issues. Its Minor test-coverage suggestion was addressed by the extra concurrency/failed/unknown/unrestricted assertions. Review did not claim live Meta verification.
- Full `npm test`: 1144 tests, 1143 passed, 1 failed, none skipped/cancelled (696510 ms). This is **not** a clean full-suite pass. The failure was `expired candidates are unreadable before bounded cleanup, which does not extend retention` in `facebookPageImportLifecycle.integration.test.ts:27` (2 candidates remained instead of 1 after a globally bounded maintenance batch). No import-maintenance product code was changed.
- Final isolated follow-up included that entire import lifecycle file and all affected send/UI tests: **34/34 passed**, 0 failed/skipped/cancelled, exit 0 (16785 ms). The full-run import failure did not reproduce. No fixture deletion or permission/credential change was used to make it pass; a fresh run regenerated only its normal local test fixtures.
- Logs: `%LOCALAPPDATA%/SocialSchedulerTools/reused-send-baseline.log`, `reused-send-red.log`, `reused-send-notice-red.log`, `reused-send-green.log`, `reused-send-bilingual.log`, `reused-send-full.log`, `reused-send-final-focused.log`, `reused-send-api-build.log`, `reused-send-web-build.log`.

## Handoff

Local implementation and tests are complete, with the full-suite caveat above. No production rule or server was touched; old production behavior remains until deployment is explicitly approved. Do not represent the new candidate reply as already allowed by the live rule or already checked unused in production.
