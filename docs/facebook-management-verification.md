# Facebook BM and engagement relaunch verification

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

## Separate external acceptance gate

Not yet verified: production management configuration, real consent/scopes/tasks, official Meta test delivery, real customer `feed`/Messenger delivery, live replies or cloud deployment. A signed local/official diagnostic event alone is not live delivery acceptance.

Before any deployment or Meta mutation, obtain separate authorization and verify an independent management config ID. Preserve original publishing config, credential values, schedules and Worker. Do not change permissions merely to make a test pass. Unknown send outcomes require human verification in Meta Business Suite, not an automatic resend.
