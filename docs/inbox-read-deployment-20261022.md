# Inbox read fix deployment and Messenger verification — 2026-10-22

## Authorized scope

Deploy the tested API/web fix, recreate only API and web, never Worker. Preserve publishing/interaction permissions, credentials, subscriptions, schedules and existing restricted-test rule. No review submission or agent-sent reply.

## Source and local verification

- Commit: `125ea9d34fa0d096feb9feb6bafb16358a348505` on `codex/tiktok-sandbox-metrics`.
- Fresh predeployment focused regression: 60/60 passed, 0 failed/skipped/cancelled (26825 ms).
- Prior full-suite caveat and successful affected-file retest are documented in `inbox-read-performance-20261022-verification.md`; this deployment does not claim a clean 1138/1138 single-run result.
- Unrelated local documentation and other untracked files were not included in the release commit.

## Deployment evidence

- Read-only capacity preflight `inv-ia7ec4g1kj`, SUCCESS/0: ~8.9 GiB disk available, ~2.2 GiB available host memory, Redis ~8 MB, public API/database/Redis health OK. Existing API and web source revision was `c087f7c4ce28928b32c8d88d5790831f82a444b8`.
- Initial prepare `inv-ha7ed5gb89` remained stalled in fresh npm dependency installation. It was explicitly cancelled before any activation; TERMINATED at 02:30:40 UTC. No live service changed.
- Build fallback `inv-ja7ejdgn0m` verified unchanged lockfiles, package manifests, timezone package and schema, then successfully compiled the new API against the existing API image dependencies. The existing web runtime image omitted the workspace-local `cos-js-sdk-v5` build dependency, so its rebuild failed without activation.
- `inv-ga7emv0mmq`, SUCCESS/0: restored only the lockfile-pinned `cos-js-sdk-v5@1.8.3` into the disposable build context from its exact npm URL, verified its SHA-512 integrity against the lockfile, then rebuilt web with network disabled. No dependency version, application source, schema or live environment was changed for this build repair.
- Activation `inv-ja7ep3ge9v`, SUCCESS/0 at 02:34:47–02:34:56 UTC (10:34 Beijing). API/web revision labels equal `125ea9d...`, public health and inbox document successful, same environment values, mounts, commands and resource/restart/port settings. API starts directly with `node dist/server.js`; no migration ran.
- Before/after publishing and interaction credential/grant/subscription fingerprints equal. Worker, PostgreSQL, Redis and reverse-proxy IDs, images and start times equal. Worker retains its 2026-10-13 start time. `.env` and `.env.sandbox.local` hashes unchanged.
- Deployed-image smoke passed for per-operation coalescing, fresh write inspection, negative cooldown and recovery, with provider fetch forbidden and no database writes.
- Final post-verification health `inv-ja7es6gsve`, SUCCESS/0 at 02:38:06–02:38:07 UTC: public API/database/Redis health and inbox document OK; API/web revision, environment-file hashes and protected service fingerprints still match. No Meta requests in this final check.

Release operation: `/opt/social-scheduler-releases/inbox-read-125ea9d34fa0d096feb9feb6bafb16358a348505`. Its private rollback configuration retains the previous API/web images and exact environment/mount settings. No new cloud resource or paid service was provisioned.

## Live Messenger read verification

`inv-ga7epcgnf5`, SUCCESS/0, 02:35:05–02:35:11 UTC (10:35 Beijing):

- Original Factory Wholesale restricted rule, selected grant, active software session and publishing credential remained valid. Rule expires **2026-10-22 15:14:19 Beijing**; expiry was not extended.
- List: 977 ms, 2 provider GETs, 1 visible conversation, partial=false, status=ok.
- Detail: 1505 ms, 4 provider GETs, 9 messages; original test marker and approved English outgoing reply present; pendingSend=false; messages.reply available.
- All six bounded provider GETs returned HTTP 200, including fresh token inspections. No rate limit occurred in this probe; this is point-in-time evidence, not a guarantee about future Meta limits.
- Existing approved-English reply attempt count=1, status=sent. Therefore the original test is already replied to and must not be described as a fresh unused recording case or automatically resent.
- Send-state fingerprint, publishing snapshot, environment-file hashes and protected service fingerprints remained equal. No provider write, refresh mutation, send, credential replacement or review submission.
- Browser UI verification was attempted in a new in-app Social Scheduler inbox tab. Both create/bind observations timed out (the inventory confirms the tab was created); no authenticated screenshot or current conversation UI state was verified. Do not claim UI screenshot verification or new Webhook delivery.

## Recording handoff

Refresh the software after deployment. Entry: `https://app.bufferhelp.com/inbox` → Facebook → Private messages → Factory Wholesale.

For a fresh receiving-and-replying recording, the user must send a new test private message from the personal test account. Suggested marker: `SS-FB-DM-1022-REC2 Messenger review demo`. Do not send the Page reply on the user’s behalf. Verify the new message and its target before handing over the single manual reply action. If the current controlled rule expires first, renewed entry authorization/preparation is required; never silently extend it.

## Fresh REC2 message verified after user confirmation

The user confirmed sending the new message. Read-only `inv-ia7evb0f5s`, SUCCESS/0, at 02:41:26–02:41:31 UTC (10:41 Beijing), verified:

- Exactly one inbound `SS-FB-DM-1022-REC2 Messenger review demo` in the pinned Factory Wholesale conversation, timestamp 02:40:35 UTC (10:40:35 Beijing).
- No outgoing message and no send attempt at or after that new inbound timestamp. The one existing successful attempt predates this new case; it was retained and not resent.
- `pendingSend=false`, `messages.reply` available, original restricted rule and session current; rule expiry remains 15:14:19 Beijing.
- List 827 ms / 2 provider GETs, detail 1539 ms / 4 provider GETs, 10 messages. All six bounded GETs returned HTTP 200, no Meta rate limit. No refresh or provider-write operation was run.
- Publishing snapshot, send-state fingerprint, environment-file hashes and protected service fingerprints equal before/after. No restart, send or review submission.

Server-side receiving/manual-reply prerequisites are now verified for the fresh marker. UI screenshot verification remains unperformed because of the previously reported browser-control timeout. The user should refresh the inbox, select Facebook → Private messages → Factory Wholesale, confirm the new marker is visible, then record and manually send the approved reply once:

`Social Scheduler Messenger reply test. This reply is for app review demonstration only.`

Keep the reply unsent until recording begins. Verify receipt on the personal test account’s Messenger side. Stop further provider probing after this successful bounded check.
