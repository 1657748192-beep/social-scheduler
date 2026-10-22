# Replayed send notice and fresh recording rule deployment

## Authority and boundaries

The user explicitly approved deploying API/web, restarting API but not Worker, retaining permissions/credentials/schedules, checking the new fixed text before activation, updating only the restricted test entry and verifying without a reply or review submission.

Deployed source: `50211456fb86975e22f7b644a19f49d1244cc789`. Unrelated local edits were not packaged. No schema/package/lockfile change or database migration. No new cloud resource or paid service.

## Predeployment evidence

- Fresh affected/import-lifecycle follow-up: 34/34 passed, exit 0 (10579 ms). Prior full-suite caveat remains documented in `facebook-replayed-send-local-verification-20261022.md`: 1143/1144 passed with one import lifecycle failure that passed on isolated rerun. Do not describe that as a clean full-suite pass.
- Capacity `inv-ia7fmxgsw6`, SUCCESS/0: ~9.0 GiB disk available, ~2.2 GiB memory available, Redis ~8 MB, public/database/Redis health OK. Worker still has its 2026-10-13 start time.
- Candidate preflight `inv-ha7fnv0gxq`, SUCCESS/0, 03:08:43–03:08:48 UTC: no historical attempt matching the new target/payload across the original app/workspace/Page, and no same-text outgoing message in the complete returned official conversation history. Four bounded provider GETs, no send. Existing rule, environment files, publishing state and protected service fingerprints unchanged.

Approved new reply:

`Social Scheduler Messenger reply test REC2. This reply is for app review demonstration only.`

## Preparation and activation

- Operation: `/opt/social-scheduler-releases/facebook-replayed-50211456fb86975e22f7b644a19f49d1244cc789` (private files mode 0600, directory 0700).
- Prepare `inv-ja7fpw032c`, SUCCESS/0, 03:09:49–03:11:03 UTC. Built both images using existing deployed image dependencies with network disabled. Workspace SDK restored from the previously verified archive and SHA-512 checked against the unchanged lockfile; no new install or dependency version change.
- Activation `inv-ia7frcgc17`, SUCCESS/0, 03:11:21–03:11:31 UTC (11:11 Beijing). Candidate still had zero attempts immediately before activation. API/web revision labels now match the tested commit; public health and inbox document OK. API directly executes `node dist/server.js`, no migration.
- Only the API runtime `FACEBOOK_MANAGEMENT_REPLY_TEST_JSON.textSha256` changed. Original user/workspace/app/Page/current connection/version/conversation/participant and expiry remain equal; `.env` and `.env.sandbox.local` hashes unchanged. All other environment values, commands, mounts, resource/restart/port settings preserved. Rollback files retain the previous images and original rule.
- Rule smoke accepted the new exact text, rejected the old text, wrong target and comment action. It invoked only pure validation and SELECT counts, never the send executor.
- Final health `inv-ja7fst0uv9`, SUCCESS/0, 03:12:55–03:12:56 UTC: public API/database/Redis and inbox document healthy; API/web revision, environment-file hashes and protected service fingerprints still match. No Meta request in this final check.
- Before/after publishing, credential/grant/subscription and send-attempt fingerprints equal. Worker/PostgreSQL/Redis/reverse-proxy IDs, images and start times equal. No provider write, send, acknowledgement, deletion, review submission or Worker restart.

## Live receiving/reply-prerequisite verification

`inv-ga7frwgg88`, SUCCESS/0, 03:11:58–03:12:04 UTC (11:12 Beijing):

- New fixed-text attempt count=0. Current restricted rule and administrator session valid; expiry remains **2026-10-22 15:14:19 Beijing**, not extended.
- Pinned Factory Wholesale list: 894 ms, 2 provider GETs, one visible conversation, partial=false, status=ok.
- Detail: 2065 ms, 4 provider GETs, 10 messages. Exactly one inbound `SS-FB-DM-1022-REC2 Messenger review demo`, timestamp 10:40:35 Beijing. No outgoing message after that inbound, no new-text attempt, no pending send, messages.reply available.
- All six bounded provider GETs HTTP 200. No rate limit in this point-in-time verification. Send-state, publishing, environment and protected-service fingerprints equal. No send or refresh mutation.
- Server-side fresh-send prerequisites now include the previously omitted payload-consumption check. The existing REC2 inbound can be used; no additional test message is needed at this point.
- Current authenticated browser screenshot was not captured; no browser pixel verification or genuine new Webhook-delivery claim is made. UI notice behavior is covered by local real-component tests and the deployed revision.

## User handoff

Refresh the software to load the new web build, choose Facebook → Private messages → Factory Wholesale, confirm the REC2 marker, and start recording before typing the exact new reply above. Click Send once, then show the outgoing message and personal-account Messenger receipt. Do not reuse the old reply text. Stop if the result is unknown or no new message appears; do not retry blindly. No agent-sent reply has been made.
