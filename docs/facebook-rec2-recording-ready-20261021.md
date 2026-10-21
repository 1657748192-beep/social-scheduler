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
