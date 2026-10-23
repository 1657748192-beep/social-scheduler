# REC3 deployment — code live, qualification closed

## Authorized scope

User authorized API/Web deployment, API-only application-service restart, additive REC3 qualification migration, necessary bounded Meta GETs and selected REC3 synchronization/qualification only after the original incoming message is confirmed eligible and under 24 hours. No send, old-attempt reset, Worker restart, Webhook enablement or review submission.

## Deployed and verified

- Exact tested release: `e10b301ccf321bedb193d37641340cd018d8d066`; prior local full regression 1271/1271 and both builds recorded in `instagram-rec3-verification.md`.
- Existing TAT target/channel only. API/Web images built offline on the existing instance from immutable rollback images, unchanged dependency lockfiles. No instance, paid service or resource limit added.
- Pending migration set verified to contain only `20261023040000_instagram_reply_recording_grant`. Applied via one-off migration command; no server/Worker command started by that migration runner. All old model HMACs identical immediately before/after migration and API/Web activation.
- API started `2026-10-23T04:31:38.558323616Z`; Web started `2026-10-23T04:31:38.714011792Z`, both labelled exact release above. Public health and inbox HTTP checks passed. Public build manifest matched container build manifest.
- Application environment, mounts, command and resource settings identical across activation; REC3 was deliberately not added to the running rule. `.env` and `.env.sandbox.local` hashes unchanged.
- Worker container/image/start time unchanged: `2026-10-13T06:01:58.401954871Z`. Postgres/Redis/reverse-proxy identities/start times also unchanged.
- Private release evidence/rollback overlays: `/opt/social-scheduler-releases/ig-rec3-e10b301ccf321bedb193d37641340cd018d8d066`. No private input, credential or raw provider body committed here.

## Controlled read did not reach the qualification gate

- Initial operational discovery cached repeated logical URLs without counting cached iterations. Repeated message pagination caused the separate diagnostic Node process to exhaust its heap; this was not an API/Worker restart. The operation never reached synchronization/qualification. Its private logs were preserved.
- Added operational total-call bound and repeated-cursor detection; no production code or safety guard weakened. Bounded read then observed identity success, two conversations and nine messages; the top-level message `after` request returned the same nine messages/cursor. It stopped with `MESSAGE_CURSOR_REPEATED` after four real GETs, without writes.
- One bounded operational nested-field cursor request stopped the repetition, but its response lacked the expected message-list structure. The existing compiled Graph DTO rejected it with HTTP-layer 502. No missing list was synthesized as empty or signed as complete.
- Further Meta requests stopped. The reviewed `ops.prepare` gate was not called, no inbound projection occurred and no qualification was created. The entry-opening script was **not executed**. This is not a successful REC3-readiness result and does not prove its original timestamp is inside the current 24-hour window.
- Deployment scope ended at this failure-closed boundary. A product-level pagination/completeness fix needs local reproduction/tests and separate approval before another deploy/readiness attempt; no ad-hoc platform-history assumptions or old-attempt resets.

## Final read-only evidence

At `2026-10-23T04:39:05Z–04:39:08Z`:

- Public API health/inbox and both service revisions verified, Worker unchanged.
- Grant count **0**, REC3 cached message count **0**, old connection attempt count **3**, running rule identical to pre-deployment rule; Webhook false with empty subscribed fields and reception false.
- User/workspace/membership/account, independent Instagram connection, old attempts, publishing posts/variants/schedules/jobs and sandbox-credential HMACs unchanged. No reply was sent, no old attempt consumed/reset, no Webhook or review action performed.
- A full-model comparison after the waiting period correctly detected changes in `OauthCredential` and `InteractionCase`; it was not reported as identical. Credential metadata showed four YouTube rows updated around `04:32:00Z`, with normal one-hour renewed expiries. The unchanged Worker log independently confirmed `2026-10-23T04:32:00.831671981Z Checked 4 youtube authorization(s)`. Existing background renewal was preserved, not rolled back or attributed to this operation. Comment-case timestamps also changed while the user-facing application remained active; these were not overwritten.

## Invocation evidence (no secrets)

- Build/preparation: `inv-ia8u8u02am`, SUCCESS.
- Additive migration + API/Web activation with REC3 disabled: `inv-ha8uaegi3x`, SUCCESS.
- Controlled reads stopped closed: `inv-ja8ub50ag8`, `inv-ha8ueqgh1m`, `inv-ja8ufj0m3a`.
- Final health/protected-state/closed-rule verification: `inv-ha8uhk0j6d`, SUCCESS.
- Read-only background-renewal attribution: `inv-ga8ui90kxi`, SUCCESS.

**Status: API/Web code deployed; REC3 qualification and manual reply entry remain closed. Do not record a send, reset an old attempt or claim readiness yet.**
