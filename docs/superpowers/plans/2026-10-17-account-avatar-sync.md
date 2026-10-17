# Account avatar synchronization implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the platform's actual account, Page, or channel avatar and name, automatically synchronize stale metadata on account-page entry, and retain manual refresh.

**Architecture:** Keep OAuth's existing avatar capture for newly connected accounts. Add manager-only metadata refresh using the existing account credential and fixed official provider endpoints; update validated avatar and name for the same provider identity. Account-page entry requests background sync for active accounts whose last attempt was at least 24 hours ago (or never); a failed attempt is also cooled down for 24 hours to avoid retry loops. Ordinary account listing remains a database read, without provider calls or credential renewal.

**Tech Stack:** TypeScript, Express, Prisma, Next.js, existing Node test runner.

**Spec:** User-approved avatar synchronization design in this conversation (2026-10-17).

## Global Constraints

- Preserve existing publishing permissions, credentials, account bindings, and schedules.
- No additional scopes, OAuth reconnection, credential renewal, Worker changes, cloud resources, or paid acceleration.
- Platform default avatars are legitimate real avatars; do not replace them with invented images.
- Refresh failures retain the previous avatar and do not change account status.
- Store synchronization timestamps inside existing account capabilities, without a schema migration. Preserve all unrelated capabilities. Enforce the 24-hour auto cooldown in the API, not only the browser; manual refresh has a one-minute duplicate-click cooldown.
- Names may change, but provider ID, account ID, history associations, and publishing grants never change. Return updated reliable profile links when Instagram/Pinterest usernames change.
- This plan does not authorize production deployment or a bulk production metadata update; confirm that release separately.
- Use the current linked worktree and preserve unrelated changes.

## Review Focus

- Cross-workspace or read-only requests must not obtain or modify another account's metadata.
- A provider identity mismatch must never attach somebody else's avatar.
- Expired credentials, provider timeouts, and missing photos must preserve the old photo and credentials.
- Unsafe image URLs and failed image loads must use a consistent neutral fallback without leaking tokens.
- Late refresh responses after a workspace switch must not replace the newly selected workspace's accounts.

### Task 1: Safe official metadata refresh

**Files:**
- Create: `apps/api/src/services/socialAccountAvatarService.ts`
- Create: `apps/api/tests/socialAccountAvatarService.test.ts`
- Modify: `apps/api/src/controllers/socialAccountController.ts`
- Modify: `apps/api/src/routes/socialAccountRoutes.ts`
- Inspect/reuse: `apps/api/src/services/socialAccountService.ts`, `apps/api/src/integrations/oauth/providers.ts` (locate actual provider configuration file before editing).

**Interfaces:** Export `refreshSocialAccountProfile(userId: string, workspaceId: string, socialAccountId: string, mode: 'auto' | 'manual')`; authenticated POST `/workspaces/:workspaceId/social-accounts/:socialAccountId/refresh-profile` returns updated non-secret name/avatar/profile-link and sync timestamps. Reuse existing crypto and workspace-manager checks; never expose provider response bodies or credential data.

- [x] Write failing tests covering manager/workspace authorization, all five supported platforms, exact identity verification, HTTPS URL validation, timeout/error/missing-photo retention, and absence of credential/status/schedule writes.
- [x] Run the new tests through the repository's existing test setup; verify failures reflect the missing implementation.
- [x] Implement fixed provider reads with bounded timeout, using the stored credential without rotating it. Facebook reads the bound Page ID; YouTube requests the bound channel ID rather than choosing an arbitrary channel. Verify current primary provider documentation before finalizing request fields.
- [x] Save only validated name/avatar, reliable username metadata, and sync timestamps after checking the account remains in the same workspace with the same provider identity/credential version. Reject expired credentials with an actionable message, without invalidating the publishing account. Keep OAuth/new-bind avatar behavior intact. Prove cooldown and overlapping request protection with real local database tests.
- [x] Run tests and API build; inspect the patch for credential, scope, and schedule mutations.

### Task 2: Account refresh control and safe avatar rendering

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/components/social/SocialAccountManager.tsx`
- Modify: `apps/web/components/dashboard/DashboardPageContent.tsx`.
- Modify: `apps/web/tests/socialAccountManager.test.tsx`
- Modify: `apps/web/app/globals.css` only if fallback styling needs adjustment.

**Interfaces:** A manager-only “刷新账号资料 / Refresh account profile” action in account details calls Task 1's endpoint. Background sync on page entry uses the same endpoint in auto mode, with at most two concurrent requests. Parent updates only the same account in the still-current workspace; viewer access stays read-only.

- [x] Write failing tests for explicit-only refresh, pending/double-click protection, success avatar replacement, failure retention, viewer restrictions, real platform default images, broken/unsafe images, and late responses after workspace switching.
- [x] Run focused tests and confirm the expected failures.
- [x] Implement the action with clear success/error text; use the provider image when valid, neutral fallback only when unavailable, and retain the platform badge. Auto-sync only stale active supported accounts on account-page entry, never on image failure. Stop queued work on unmount/scope change; no retry loop.
- [x] Run focused tests, the full existing test suite against the independent local test database, and API/Web production builds. No production credentials in test fixtures.
- [x] Review the complete diff against the constraints; document test results and any provider limitation. Commit only task-owned changes if requested by the execution workflow.

### Release boundary

- [ ] Present verified local results and request confirmation before deploying API and Web. Worker must not restart.
- [ ] After release authorization, retain rollback artifacts, compare protected credential/schedule snapshots, and verify unchanged Worker identity. Then refresh existing accounts explicitly under the approved metadata-only scope and report per-account results without exposing image URL signatures.
