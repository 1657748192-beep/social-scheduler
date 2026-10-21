# Factory Wholesale recovery — 2026-10-21

## Approved boundary

Restore only Factory Wholesale's missing binding, independent interaction selection and original-app comments/messages subscription. Preserve all pre-existing publishing permissions, credentials and schedules. No API/Worker restarts, no permission applications or review submission. Do not send a reply without a current controlled target and approved text.

## Evidence and execution

- Read-only preflight `inv-ja6cgkgn94` succeeded: exact Page `182945841568122`, original app `1013567811268870`, workspace `6ebc7e2c-af04-4ce8-a5ab-ec2b9a8f09af`, managed Page `ebcac8dd-ad75-4a12-adcb-dce42e330f20`, independent connection `05479d25-effe-478b-811a-4ebd193caf97`. No existing SocialAccount in any status for this Page/workspace; selection pointed elsewhere. Current administrator session, Page identity, required scopes/tasks and token validity verified.
- Existing insert-only import, directory and additive-subscription integration tests: 13/13 passed, no skips. Independent operational script review found no critical/important scope or correctness issue; it explicitly noted separately committed stages must not be blindly retried after a partial failure. Syntax check passed.
- Restoration `inv-ha6cj2gvqc` succeeded, 2026-10-21 15:09:57–15:10:06 Asia/Shanghai. Used the canonical Page revalidation and insert-only helper to create exactly one new SocialAccount/credential from the existing verified independent Page token. No pre-existing publishing credential replaced or refreshed.
- Selected only the exact managed Page via the existing directory service. Verified the original app callback is active at `/api/v1/webhooks/facebook` with existing feed/messages fields. Enabled Page notifications through the canonical additive subscription service, retaining existing subscribed fields.
- Before/after HMAC comparisons matched every pre-existing publishing row (users/workspaces/members, accounts/credentials, TikTok test credential, posts/variants, schedules/jobs), independent Facebook connections, all other managed Pages/selections/subscriptions. Only the explicitly restored Page's selection/subscription and notification flag were excepted; exactly one account and one credential were added.
- Environment-file hashes unchanged. API/web container ID, image and start time unchanged; Worker/Postgres/Redis/proxy unchanged. API health/database/Redis passed. No sends, source deployment, token refresh or new cloud resources.
- Follow-up access probe `inv-ga6cjm0xqb` succeeded: one active binding, exact selection matches, independent token valid with original app and correct Page identity.
- Follow-up provider readiness probe `inv-ha6cjn08bu`: read/reply scopes available, Page subscription exactly feed/messages, two existing controlled comment markers readable (one prior successful reply, one unsent marker). Existing controlled DM and one prior outbound test receipt readable; original inbound marker is outside 24 hours. Provider-read evidence does not prove fresh signed Webhook delivery or software recording readiness.

## Initial unresolved gates (subsequent approval below)

- `FACEBOOK_MANAGEMENT_REPLY_TEST_JSON` is an expired, startup-copied comment restriction. The running API cannot renew it from a database association change. No environment or process mutation was performed to bypass the no-restart boundary.
- The old controlled published Schedule still exists, but its PostVariant.socialAccountId is null. Importing a new binding does not relink historical posts; no historical association, schedule, content or publication state was edited.
- The software test entry is therefore NOT reopened, and a new manual reply is NOT verified. Continuing requires explicit direction on an API-only restart and the exact historical test-post association, or a separately authorized new test-publication workflow. A fresh inbound test DM is required before another standard-window message reply.

Operational evidence retained server-side under `/opt/social-scheduler-releases/factory-recovery-20261021` (0700), with sanitized operation log and infrastructure/environment fingerprints. Existing unrelated verification-document changes were not edited.

## Explicitly approved comment-entry recovery

The user subsequently approved an API-only restart and restoring only the exact historical published test PostVariant's account association, without changing content, publication time or Schedule state.

- Read-only preparation `inv-ia6cp2g2m0` succeeded: exact provider-owned photo/story, Schedule/variant, unused `SS-FB-C-1019 评论功能测试` comment, fixed prior-approved reply-text digest and absence of consumed receipts verified. The variant has one Schedule only. Comments/subscription still available. No preparation writes/restart/sends.
- Restricted comment-reading/final-fence/expiry tests passed 9/9, no skips. Operational review found no critical/important blocker; shell and Node-block syntax checks passed.
- Initial activation `inv-ja6cr0g7v9` stopped before any mutation/restart because unrelated active publishing changed whole-table snapshots. Read-only diagnostic `inv-ia6crsgq7q` confirmed exact target variant still matched its original null association and API ID unchanged. No unrelated records were reverted.
- The repair's protection was moved into a single RepeatableRead transaction: lock authorized session/member/target variant/independent connection, compare all protected-model HMACs before/after the one update in that same snapshot, normalizing only target `socialAccountId` and normal audit `updatedAt`. This permits unrelated concurrent publishing without stopping Worker. Re-review found no important issue.
- Activation `inv-ha6ct60pp2` succeeded, 2026-10-21 15:18:36–15:18:47 Asia/Shanghai. Exactly one variant linked to the restored Factory account; all other fields, Schedule records and publication state preserved. Protected-transaction comparison passed.
- Recreated only API, with the same image/revision. All runtime env values except the pinned rule's expiry matched, including current TikTok test mapping; mounts/resources and direct `node dist/server.js` command matched. Environment files and Worker/web/PostgreSQL/Redis/proxy remained unchanged. A transient startup 502 recovered on the next health retry; no rollback ran.
- Live runtime reads verified one exact controlled comment; wrong user/workspace/Page denied; comment read/reply capabilities available, message read/reply still closed by the comment-only restriction. No reply sent. Unauthenticated management status returned401.
- Entry expires **2026-10-22 15:14:19 Asia/Shanghai**, automatically fails closed. Only the designated administrator, original app/Page/grant epoch, one post/comment and exact previously approved text are admitted. No permission/review/application-publication changes.
- Real inbox refresh succeeded but list/detail verification FAILED (`inv-ia6ctq0xhp`, instrumented retry `inv-ga6cudgpj2`: list_case404). Browser control connection timed out, so no browser/UI screenshot acceptance is claimed.

## Final verification blocker — do not claim recording readiness

- Read-only case probes `inv-ja6cv3gv95` and `inv-ia6cvu0aeu` confirmed both old controlled cases retain the correct current managed Page/connection/epoch. The Page passes lifetime filters and events are within90days. However `inboxSourceAlive` denies them via an existing asset cutoff marker at **2026-10-20 09:45:23.008 Asia/Shanghai**. Neither current-epoch, legacy-epoch nor item-specific markers matched; it is specifically the old-event cutoff. No deletion markers or occurrence times were modified.
- The management-level provider reader can read the old comment, but this is NOT unified-inbox acceptance. A restored binding and renewed test rule must not bypass the existing privacy/deletion cutoff.
- The list SQL lifetime predicate does not apply that cutoff marker; it selects the old cases, then per-case access correctly returns404. Thus merely sending a fresh comment does not yet prove that the unfiltered list will succeed with the old protected cases present. Do not delete cases or remove protection as a workaround.
- Next bounded proposal: fix listing to safely omit protected/invalid historical sources, preserve all deletion guards, obtain a new explicitly controlled user comment, repin the one-comment rule and update/restart only API after verification. This requires further user direction; no source edit, second restart, test reply, or marker reset was performed.
