# Facebook BM and engagement relaunch verification

## Current cloud delivery status, 2026-10-17

This section supersedes the earlier chronological preflight/blocker notes below. Authorized API/Web-only deployment completed at console 10:00:04–10:00:09, release commit `88af3b36bea631e79cdee093049583d2ebb88483`. Management is enabled with independent config `1046726461751818`, Graph v26.0 and exact HTTPS facebook-management callback. Original Meta config entries and the three old OAuth callbacks remain; only the fourth callback was added. Both comment permissions are in review preparation (“准备测试”), not approved; the app was not published or submitted for full review.

- Backup directory: `/opt/social-scheduler-releases/facebook-management-20261017-88af3b3`, mode 0700. Database dump mode 0600, 1.2MB, SHA256 `fc718c35105165cbad4e893c4812262f93b7fb2402487e8e89487ec8ca8df9b5`. Original config/Compose, private container inspection, protected table digests and old API/Web image tags retained. An initial directory-owner failure was resolved by creating only this new directory as ubuntu via sudo; no prior backups were changed.
- Production backup restored into existing PostgreSQL database `facebook_management_restore_20261017`; all three additive migrations passed there before production. Restored publishing credential/account/schedule/job digests match their pre-migration values. No new cloud resource or COS upload.
- API/Web build exit 0. Production applied exactly `20261016000100_facebook_management`, `20261016000200_facebook_management_relations`, `20261016000300_facebook_management_app_identity`. Startup used original .env + .env.sandbox.local and both original Compose files, `up -d --no-deps api web`. No full deploy script, reset or Worker recreate.
- Four new management keys appended to .env; byte-prefix check confirms every original byte was preserved, .env.sandbox.local unchanged. Rendered original provider/JWT/encryption/database/Redis environment values equal the old API environment, with no management keys added to Worker.
- Public health at 10:00:48: API ok, database ok, Redis PONG; /en, /facebook-management and /facebook-inbox HTTP 200. Production oauth_credentials, social_accounts, schedules and publish_jobs digests all unchanged.
- New API container `bc8fd08e4ae9`, Web `1fe7ace5ee3e`. Worker remains full ID `3cbc3bed81805673ee7a949da9fcefefecc3619761d68e5eb25da50344f97e5e`, original StartedAt `2026-10-13T06:01:58.401954871Z`. Root 12G available, 81% used after build.
- Logged-in browser renders BM management and Facebook inbox navigation and the “连接管理授权” button. It explicitly reports no independent connection and no automatic import of publishing credentials. No actual management OAuth consent, live Page scope/task validation, subscriptions or customer sends were performed. Real comment/Messenger delivery and manual replies remain unaccepted, not claimed fixed.

Rollback preparation (not executed): old images are tagged `social-scheduler-api:before-facebook-management-20261017` and `social-scheduler-web:before-facebook-management-20261017`. Retag these to their normal latest tags and recreate only api/web with the original Compose/env file ordering. Do not run down, recreate Worker, drop new tables, or restore over production. The temporary restore database and restricted dump are retained for acceptance/rollback evidence; their removal is a separate named cleanup, never a production restore.

## Boundaries

Local development only, 2026-10-16. Feature disabled by default. No push, Tencent Cloud deployment, Meta dashboard changes, real OAuth consent, subscription changes, or real customer replies were performed.

BM directory is read-only. The new management grant has separate state, encrypted credentials, directory, selection, received-event and send-attempt storage. Publishing account bindings, original credential ciphertext/scopes/expiry, schedules and publishing Worker are not repurposed. Instagram inbox and legacy `/inbox` remain retired.

## Automated evidence

- Tasks 1–10: complete; full regression at Task 10: 539 passed, zero failures/skips.
- Lifecycle regressions reproduced manager disconnect rejection and retention of a removed authorizer's independent token before fixes. The tests then passed.
- New lifecycle verification covers independent OAuth, directory refresh/selection, message/comment read and manual replies, additive subscriptions, authorization invalidation, disconnect and 90-day expiry. It snapshots original SocialAccount + credential, Post + PostVariant, Schedule + PublishJob before/after, including a future waiting job.
- Actual isolated HTTP app is used to remove, disable and demote an authorizer. Re-adding the member does not revive cleared independent credentials. Other workspace grants and original publishing records are unchanged.
- Workspace/user FK deletion removes new connections and private data. Existing admin deletion already deletes workspaces/users transactionally; no replacement of its publishing/media deletion semantics is necessary.
- New lifecycle file: four tests passed. Final full regression: 543/543 passed, zero failures/skips; root API + Web production build and diff check passed.
- Local database and Redis use existing named test containers and loopback-only validated test URLs. No production database fallback.

## Browser evidence

`apps/web/tests/fixtures/facebook-management-fixture.tsx` renders the real BM, inbox and comments components with synthetic API boundary responses; there is no external-network fallback or real token.

Reproduce from repository root with `node scripts/serve-facebook-management-fixture.cjs`; open the printed loopback address, then stop the server when finished. No production test route is added.

Verified through the in-app browser on a loopback-only fixture server:

- 21 Page cards, two independent connections, explicit alternate connection reflected in inbox URL.
- Disconnect explanation says publishing accounts/permissions/credentials/schedules are unchanged and no shared Meta unsubscribe occurs.
- 390px viewport: document client/scroll width both 375px (scrollbar included), no horizontal overflow; viewport override reset afterward.
- Page switch clears draft and replaces synthetic customer/message identity.
- Double-click of Send produces one synthetic boundary send.
- Comment expand exposes separate capability/subscription state, explicit identity and manual reply control.

The fixture is not evidence that Meta delivered a live event. Login/membership checks are additionally exercised by server route tests. Viewer/window/error/unknown-send and stale completion behavior are covered by component tests.

## Independent code review

One fresh-context whole-branch review found no Critical issues and two Important issues: background refresh discarded a paginated conversation's selection/draft, and cached webhook comment text could override a newer successful Graph read. Both were reproduced by added failing tests and corrected in one fix pass. Pagination/selection/draft now survive background refresh; current Graph bodies win for the same ID while local-only arrivals and deletion tombstones remain. Focused regression run: 13/13 passed. Final full regression after this fix pass: 545/545 passed, zero failures/skips; API + Web root production build and diff check passed. No Minor findings were raised.

The reviewer explicitly did not judge live Meta scopes, delivery, replies or production deployment; those remain external acceptance, not deferred product fixes.

## Separate external acceptance gate (not performed)

### Independent Meta configuration, 2026-10-17

After specific user authorization, added `pages_manage_engagement` and `pages_read_user_content` to review preparation; both visibly show “准备测试”, not approval or a submitted whole-app review. Created `Social Scheduler BM Inbox`, config ID `1046726461751818`, standard login/user access token, with business_management, pages_manage_engagement, pages_manage_metadata, pages_messaging, pages_read_engagement, pages_read_user_content and pages_show_list. Creation-success dialog verified. pages_manage_posts was explicitly unselected. Original Page Publish and Engagement entries retain IDs 1748083276619458 and 1119177347324881. App remains unpublished. Added only the new facebook-management OAuth callback to the existing three callback entries and saved; no token consent performed.

Second server read-only check succeeded (console 09:39:01): original HEAD unchanged, tracked tree clean, Compose files docker-compose.yml + docker-compose.server.yml, environment files .env + .env.sandbox.local. API image sha256:9400ef3207847cf6393e76c5c5fcdf408e6ec5ab9ba99adf1e7f8b5b50cbbdd6; Web image sha256:e5f6965c2765a7ce07c7f94705d7867544c08f07fc1ce688e449219255c92a01; network social-scheduler_default; database 16 MB; root disk still 9.7G available. Production migration/build/restart not yet performed.

### Authorized preparation, 2026-10-16

### Live preflight, 2026-10-17

The user explicitly authorized connecting the existing Tencent Cloud terminal, independent management configuration and API/Web-only deployment, with no Worker restart or original publishing credential/schedule changes. Orca UI reported one connected session, but terminal typing timed out. The existing same-instance TAT command entry was used instead; COS execution-record upload remained unchecked, execution user ubuntu, working directory /opt/social-scheduler.

One read-only preflight completed successfully (exit 0, console time 2026-10-17 09:07:41). Server HEAD is `fd2f78fdcb3387bb6476c80c70041363223a4bf1`, with no tracked modifications; existing untracked environment/Compose backups and backups/ were preserved. Root disk: 59G total, 47G used, 9.7G available (83%). Existing Web `e081d2ba6111`, API `1dac257f12b7`, Worker `3cbc3bed8180`, PostgreSQL `983d9bb5cad5`, Redis `fc3896ca98c5`, proxy `2b75828c9f7d`. Worker full ID `3cbc3bed81805673ee7a949da9fcefefecc3619761d68e5eb25da50344f97e5e`, StartedAt `2026-10-13T06:01:58.401954871Z`. Original .env SHA256 `6fcf56b6c9a3e120e0f8daaf08d1929e91d0a677712d99a7775bfda58347dd12`.

Meta new configuration wizard `Social Scheduler BM Inbox` reached permissions, standard login + user access token, no system user or asset-assignment flow. No final Create/save/consent was performed. The available list contains business_management, pages_manage_metadata, pages_manage_posts, pages_messaging, pages_read_engagement and pages_show_list; do not select pages_manage_posts for the new interaction flow. Required comment scopes pages_manage_engagement and pages_read_user_content are absent. Read-only Page-use-case inspection confirms both show “加入应用审核”, whereas original publishing scopes remain “可发布”. Creating a purported complete config now would omit comment rights. Stop before adding review permissions or saving broader sensitive access; obtain specific action-time confirmation for the two comment permissions and the final seven-scope independent configuration. No push, backup/migration, environment write, deployment or restart has occurred.

The user confirmed proceeding with independent management configuration and Tencent Cloud deployment preparation. Server Compose was missing all four new management variables. Added API-only pass-through for `FACEBOOK_MANAGEMENT_ENABLED` (default false), `FACEBOOK_MANAGEMENT_LOGIN_CONFIG_ID`, `FACEBOOK_MANAGEMENT_GRAPH_API_VERSION`, and `FACEBOOK_MANAGEMENT_CALLBACK_URL` (remaining defaults empty). No original environment values or Worker service configuration were changed. A real `docker compose config --format json` test reproduced missing API settings before the change and then passed, including disabled-by-default and no management keys in Worker/Web. Full regression: 546/546 passed, zero failures/skips; diff check passed.

Read-only Meta inspection confirmed application `1013567811268870` remains in development, with existing Page Publish config `1748083276619458` and old Engagement config `1119177347324881`. The old Engagement entry warns that some permissions are restricted. Neither existing configuration was edited. Opened a new independent configuration wizard, but did not submit/save permissions or complete consent; interaction timed out before the login-method stage could be verified.

Existing TAT terminal UI briefly reported one connected session. Submission of a read-only version/container/disk/config-hash check timed out, so its execution/output is unconfirmed and must be inspected before retrying. Direct batch SSH to the same instance timed out. No deployment, migration, restart, production environment write, real reply/comment, or Meta permission save was sent. Resume by restoring the browser control connection and re-reading server and wizard state; do not infer deployed status from these local tests.

Not yet verified: production management configuration, real consent/scopes/tasks, official Meta test delivery, real customer `feed`/Messenger delivery, live replies or cloud deployment. A signed local/official diagnostic event alone is not live delivery acceptance.

Before any deployment or Meta mutation, obtain separate authorization and verify an independent management config ID. Preserve original publishing config, credential values, schedules and Worker. Do not change permissions merely to make a test pass. Unknown send outcomes require human verification in Meta Business Suite, not an automatic resend.
