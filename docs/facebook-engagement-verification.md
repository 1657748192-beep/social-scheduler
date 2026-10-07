# Facebook engagement verification

## Local adapter stage — 2026-10-07

No production authorization, webhook subscription, customer send or deployment performed.
Adapter receives an explicit API version; existing Facebook code uses v20.0. Real Page compatibility remains a rollout acceptance check, not a claimed result.

Official references checked:
- Meta Messenger collection: https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a — Page conversations, Page token, access restrictions.
- Meta Send API: https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api — Page messages endpoint and standard reply window.
- Meta generated SDK: https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/comment.py — comment object association and comment reply edge.
- Meta reference URLs for Comment and Page subscribed_apps returned HTTP 429 during research. Subscription fields and version-specific behavior must still be verified on a controlled test Page before enablement.

The adapter never follows provider next URLs or redirects, uses Page Bearer tokens, and checks actual debug_token grant/identity for capability prerequisites. Available scope status does not prove a user's Page task or Advanced Access: real Graph requests remain authoritative. Missing/ambiguous responses are not treated as empty lists. Sends have no automatic retry, and transport/ambiguous results are returned as unknown.

Task 1 verification: 12 new adapter/policy tests passed; API TypeScript build passed; configured independent-database full suite 300 passed, 0 failed, 0 skipped. Configuration for test runs is taken from existing disposable local Docker database without printing its password. No production DB used.

## Supplemental authorization stage

Created independent `facebook_engagement_test` on the same disposable local container at 127.0.0.1:55436. Applied all 17 migrations from scratch, including additive Facebook OAuth fields. The earlier reception_test has no migration ledger, so it was not reset or baselined. All integration suites now use the new test database for this branch.

Authorization entry and dedicated callback are implemented behind FACEBOOK_ENGAGEMENT_ENABLED=false. The Meta app must allow `/api/v1/integrations/facebook-engagement/oauth/callback`; Login for Business config must include requested additional permissions. No real settings changed yet. Supplemental states cannot be used through the ordinary callback to bind every returned Page.

Task 2 verification: actual-grant gateway tests, cancellation/mismatch/replay tests, Prisma concurrent-consumption/CAS/role tests passed; API build passed; full configured suite 308 passed, no failures or skips. Publishing scopes and account status are untouched when interactive permissions are absent.
