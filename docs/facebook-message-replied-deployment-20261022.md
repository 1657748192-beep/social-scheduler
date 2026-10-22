# Facebook message replied status deployment

## Scope and tested revision

User approved API/web deployment, API restart only (no Worker restart), retaining
send protection, permissions, credentials and schedules. No Meta request, reply or
review submission is authorized or performed by this deployment workflow.

Source revision: `aea7755ef138e90bfc8e0737187c6096106031c5`.
Only two presenter/read source files, one regression test and the local verification
note were committed for this fix. Unrelated working changes were not packaged.
No package, lockfile, schema, migration or sender/idempotency change.

## Verification and preparation

- Previous complete local run: 1,147 passed, 0 failed. API/web build passed.
- Fresh predeployment targeted run: 17/17 passed, exit 0, 8,135 ms.
- Capacity `inv-ja7gn80pta`: SUCCESS/0, 03:42:08–03:42:12 UTC. About 9.9 GiB
  disk and 2.2 GiB memory available; public API/database/Redis healthy. Worker
  still running since 2026-10-13 06:01:58 UTC.
- First preparation `inv-ia7gpj01q2` stopped before creating its release directory
  because the release parent requires privileged directory creation. No service
  was changed; corrected to the established exact-path `sudo install -d` step.
- Preparation `inv-ja7gq9gehq`: SUCCESS/0, 03:44:20–03:45:33 UTC. Both images
  built offline from existing running image dependencies. Existing workspace SDK
  archive verified against the unchanged lockfile integrity. No new installation,
  configuration change or service restart during preparation.

Operation directory:
`/opt/social-scheduler-releases/facebook-message-replied-aea7755ef138e90bfc8e0737187c6096106031c5`
(0700; private configuration files 0600).

## Activation

`inv-ja7gri0g4a`: SUCCESS/0, 03:45:41–03:45:51 UTC (11:45 Beijing).

- Updated only API/web via compose `--no-deps --no-build --pull never api web`.
  API command remains `node dist/server.js`; no migration is executed.
- Both image revision labels match the tested revision. Runtime environments,
  commands, mounts, resource/restart/port settings and environment-file hashes
  match before deployment. The restricted test rule was not changed or extended.
- Public health and inbox HTML succeeded; deployed web manifest matches the
  public manifest. Unauthenticated inbox accounts access remains HTTP 401.
- Read-only presenter smoke used the existing pinned conversation and successful
  receipt: `replied=true`. An in-memory later inbound timestamp returns false.
  Case status/version/read position remain unchanged. No access resolver or Meta
  adapter was invoked; fetch was explicitly blocked in this smoke process.
- Before/after publishing, permissions, credential/grant/subscription and send
  attempt HMAC snapshots match. Worker/PostgreSQL/Redis/reverse-proxy IDs,
  image IDs and start times match. No provider call, send, acknowledgement,
  deletion, review submission or Worker restart.
- Previous image/config rollback material is retained in the private operation
  directory. No resource purchase, dependency change or paid service added.

Final independent health `inv-ga7gs8gfu0`: SUCCESS/0, 03:46:25–03:46:27 UTC.
Public API/database/Redis and inbox document healthy; revision labels, all protected
state HMACs, environment-file hashes and protected service fingerprints still match.
No Meta request in this check.

This validates the deployed code and existing database receipt, not browser pixels
or an additional real send. Do not resend the already confirmed recording reply.
