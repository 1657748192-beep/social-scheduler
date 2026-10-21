# Factory Wholesale REC2 recording entry — 2026-10-21

## Approved boundaries

One minimal read-only Meta rate-limit check; if recovered, prepare SS-FB-C-1021-REC2 single-comment recording entry. No reply sends, Worker restarts, credential/scope/schedule changes, or review submission.

## Fresh evidence

- `inv-ia6gpigi8c` SUCCESS/exit 0 at 09:31:17–09:31:18 UTC: token inspection and Page identity succeeded; Page and required comment scopes matched. This verifies those reads recovered at that time, not a guarantee against future rate limits.
- `inv-ia6gqc02tt` SUCCESS/exit 0 at 09:32:08–09:32:12 UTC: exact post and REC2 root comment read successfully, no child replies, zero target send attempts, current authorized connection epoch matched. Preparation wrote private operational files only; no database mutation or service restart.
- `inv-ha6gqmghu4` SUCCESS/exit 0 at 09:32:27–09:32:48 UTC: selected the already-authorized new interaction connection and repinned the restricted comment rule. API reused source/image revision `c087f7c4ce28928b32c8d88d5790831f82a444b8` with only commentId, managedPageId, connectionId and connectionVersion changed in FACEBOOK_MANAGEMENT_REPLY_TEST_JSON. One transient startup 502 recovered during health retries. No migration or source deployment.
- Actual inbox refresh, list and detail passed against Meta. List contains the one current test comment; reply target is REC2, reply capability available, replied false, no pending send. Historical deletion protection and wrong-user/workspace/Page denial passed. Message read/reply gates remain closed.
- Protected credential, Page grants, subscriptions, schedule/jobs, deletion marker and send-attempt snapshots compared equal. Worker/postgres/Redis/proxy identities and web identity unchanged. Original environment files unchanged. No reply was sent.

## Handoff

- Entry: https://app.bufferhelp.com/inbox ; Facebook → comments → Factory Wholesale → SS-FB-C-1021-REC2.
- Restricted rule expires at **2026-10-22 15:14:19 Beijing** (2026-10-22T07:14:19.585Z), unchanged.
- Only the original approved text is allowed: `SS-FB-C-REPLY-1019 评论回复验证，仅用于审核测试。`
- Leave Send untouched until the user records. Do not unbind, reauthorize, change the current interaction selection, or broaden the target without revalidating the current epoch/entry. This verifies the comment function segment, not a fresh end-to-end OAuth recording or private-message readiness. No browser screenshot was captured in this check.
- Private server operation directory: `/opt/social-scheduler-releases/factory-rec2-ready-after-avatars-20261021`. Prior after-auth metadata retained; do not rerun old b687d8c preparation/activation scripts over the current avatar image/configuration.

## User send diagnosis — 17:38–17:39 Beijing

User reported an unknown-send banner after clicking Send. Read-only `inv-ia6gvs0cqu` succeeded: rule active/current selection and connection match, zero target FacebookInteractionSendAttempt rows; official reply edge returned zero children and no next cursor. Protected publishing snapshot and all service identities unchanged. No resend or acknowledgement performed.

Local audit `inv-ga6gwt009k` succeeded: one reply.reference at 09:36:11.271Z, no matching platform send attempt. Sanitized inbox POST logs contain one 403 and two 200 responses, no logged inbox 429. Earlier local audit invocation stopped only at host node absence after printing the same audit; corrected analyzer runs inside the existing API container, without mutation or restart.

Code trace: replyToCase records reply.reference before adapter.reply; Facebook replyComment asserts exact restricted input before send-attempt admission. A text mismatch can therefore produce this evidence. ReplyComposer catches every thrown HTTP error and presents unknown without distinguishing a definite local 403. This presentation defect is confirmed by code; exact rejection reason remains unconfirmed because the response body/input was not retained in these logs. Ask user for the exact reply text before attributing it definitively to the restriction. No product fix or deployment authorized/performed in this diagnosis. REC2 is now blocked by the unresolved reference until safe handling is designed; do not claim the entry remains immediately ready or clear it silently.

## English-only rule approved and active — 17:42 Beijing

User explicitly approved changing the exact allowed reply to:

`Social Scheduler comment reply test. This reply is for app review demonstration only.`

- Only textSha256 changed in the current restricted rule. REC2 target, user/workspace/Page/connection, expiry and source image revision c087f7c stayed unchanged. Old Chinese text is no longer approved by this rule. No product code or web deployment was needed; only API was recreated to load configuration.
- First preparation `inv-ga6h0b06k4` passed. Activation `inv-ha6h10gsgc` safely rolled back when its precondition required the prior reference to be unacknowledged. Read-only `inv-ja6h1jgg5k` confirmed that reference already had an acknowledgement, exact actor/source matched and zero platform attempts. No reference was deleted or duplicated; already-acknowledged state was retained.
- Fresh preparation `inv-ha6h1xgi9x` passed. Final activation `inv-ha6h24gki0` SUCCESS/exit 0, 09:42:34–09:42:49 UTC: new English rule accepted and unapproved text rejected via pure rule assertions; official replies still zero, platform attempts zero. Actual inbox list/detail, reply target/capability and no-pending-send checks passed. Prior history deletion protection, foreign scope denial and closed private-message gates passed.
- Full publishing snapshots and target credentials, grants, subscriptions, schedule/jobs, markers and attempts compared equal. Worker/infrastructure and web identities unchanged. API health recovered from a transient startup 502. No send or review submission occurred. Frontend generic-error presentation was not modified.
- Current private operation directory: `/opt/social-scheduler-releases/factory-rec2-english-v2-20261021`. Reload the whole web page to clear stale local unknown outcome before manually entering the exact English text once. Expiry remains 2026-10-22 15:14:19 Beijing. Do not reuse prior Chinese-rule operational scripts.
