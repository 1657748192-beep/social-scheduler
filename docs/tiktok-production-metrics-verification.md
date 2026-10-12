# TikTok production metrics enablement — 2026-10-12

User confirmed approval of user.info.stats and video.list and requested production enablement and Tencent Cloud deployment.

## Changes

- Active TikTok accounts expose optional supplemental data authorization to workspace owners/admins, reusing the existing manager-protected OAuth start flow.
- Missing-permission notices describe the current account grant rather than pending application review.
- Existing OAuth callback checks that previously granted publishing scopes remain before replacing credentials. Generic OAuth can connect another identity; users are explicitly instructed to authorize the same account.
- Sandbox credentials and controls remain isolated. No schema migration or publishing behavior change.
- Fixed an existing test-only TypeScript narrowing issue by asserting a copy of the overview results array.

## Local verification

- The new authorization-entry rendering test failed before implementation, then passed.
- API and frontend production builds passed; frontend type check passed. Next.js reports the existing multiple-lockfile workspace-root warning.
- Focused TikTok API tests: 29 passed.
- Frontend tests: 100 passed.
- Before Docker startup, full API verification reported missing independent test database configuration. It was not waived.
- After starting only codex-instagram-reception-test and using its existing facebook_engagement_test database, the complete API + web suite ran serially: 346 passed, 0 failed, 0 skipped. Production DATABASE_URL was not used.
- Read-only review found no blocking issues in the bounded frontend diff.

## Deployment status

Deployed application version 178471e to Lighthouse lhins-qkg26b57 on 2026-10-12. Web build exited 0; only API and web were recreated. Worker and data containers stayed running. No migration or data deletion was performed.

API runtime confirms TIKTOK_OAUTH_SCOPES=user.info.basic,video.publish,user.info.stats,video.list and TIKTOK_SANDBOX_ENABLED=true. The existing scope configuration contained user.info.basic and video.publish; both remain.

Protected backup: /opt/social-scheduler-releases/tiktok-production-178471e-20261012 (ubuntu-owned mode 0700), including original .env, .env.sandbox.local and both Compose files. Existing API/web images tagged before-tiktok-178471e for rollback. Initial directory creation failed because the parent was root-owned; no config changes occurred in that attempt. A disconnected-terminal submission was checked before retry. Terminal command completion required dismissal before actual execution.

The initial immediate-start health check returned 502. A subsequent independent public check returned exit 0 with ok=true, database=ok and redis=PONG.

Existing account tokens still need real TikTok user consent; scope configuration alone does not grant access. The software's current browser session is expired and the login form is empty. Account-specific consent and live metrics verification remain pending user login/authorization.
