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

Pending deployment. Production previously requested only user.info.basic and video.publish. Deployment must append user.info.stats and video.list while preserving any configured scopes. Existing account tokens still need real TikTok user consent; scope configuration alone does not grant access.
