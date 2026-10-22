# Factory Wholesale Messenger recording entry — 2026-10-22

## Scope

User requested Facebook private-message recording preparation, then confirmed sending the new test message. Restrict the entry to the existing administrator, workspace, original app, Factory Wholesale, its currently selected authorized connection and exactly one verified conversation. No agent sends, review submission, scope/credential/schedule changes, Worker/web restart, or new cloud resources.

## Evidence

- Initial read-only `inv-ha7c76g78g` SUCCESS/0: current grant has pages_messaging, pages_manage_metadata and pages_read_engagement with MESSAGING task. Conversations read successfully; five inspected threads had no open old test window. Publishing and service fingerprints equal.
- `inv-ga7c9f0k3v` SUCCESS/0: found exactly one inbound `SS-FB-DM-1022 Messenger review demo`, timestamp 2026-10-22T01:11:02Z (09:11:02 Beijing), matched verified Page/conversation participant, active session and current epoch; no identical English reply/attempt, source deletion admission passed. No database mutation.
- `inv-ga7ca1gr3a` prepared configuration. First activation `inv-ja7cavgfhu` rolled back safely at detail verification due to a legacy unresolved reference, rather than leaving an unverified send entry open.
- Read-only `inv-ha7cbu06fr` and `inv-ga7ccg0xqc` established that the new message, target and reply capability were correct. The remaining pending reference dated 2026-10-19T09:35:28.097Z maps to one older-connection platform attempt with status sent; its exact provider receipt exists as an outgoing message in this same Page/customer conversation. Epoch rotation prevented the ordinary current-epoch resolver from settling it. No automatic product behavior was changed.
- Fresh preparation `inv-ja7cd1gvnv` SUCCESS/0. Final activation `inv-ia7cda086r` SUCCESS/0 at 01:16:05–01:16:27 UTC (09:16 Beijing). API reused image/source c087f7c4ce28928b32c8d88d5790831f82a444b8, changing only the controlled rule from comment to message, pinned conversation/participant and approved text hash. User/workspace/Page/grant epoch remained equal and expiry was not extended. Startup 502 recovered during health retries; no migration.
- Existing acknowledgeSend workflow appended a local acknowledgement only after checking the exact old reference, successful attempt, same workspace/app/Page/customer and official receipt. Historical reference/attempt/receipt retained, no resend. Actual new-message refresh/list/detail verified; no pending send, messages.reply available, wrong text/conversation/comment input and foreign user/workspace/Page rejected. Zero attempts for the new English reply.
- Fresh publishing snapshots and protected credential/Page grant/subscription/schedule/jobs/deletion marker/send-attempt fingerprints equal. Worker/postgres/Redis/proxy and web identity/image/start fingerprints equal. Original environment files unchanged. Provider-write guard prohibited non-GET requests during verification. Only existing services/resources used.

## Handoff

Entry: https://app.bufferhelp.com/inbox → Facebook → Private messages → Factory Wholesale → the conversation containing `SS-FB-DM-1022 Messenger review demo`.

Exact allowed manual reply:

`Social Scheduler Messenger reply test. This reply is for app review demonstration only.`

Entry expiry remains **2026-10-22 15:14:19 Beijing**, earlier than the new inbound message standard-window deadline. The current entry is the function demonstration segment. Refresh the whole web page before recording, enter the exact text and click Send once during recording; verify receipt on the customer Messenger side. Do not reauthorize/unbind before recording without revalidating/repinning the grant. This check did not capture a browser screenshot, prove new Webhook delivery, or send a live response.

Current private operation directory: `/opt/social-scheduler-releases/factory-dm-english-recording-v2-20261022`. Do not rerun historical REC2/comment rule activation scripts over the current message entry. Comments are deliberately closed by the message-only restriction; existing publishing remains separate and unchanged.
