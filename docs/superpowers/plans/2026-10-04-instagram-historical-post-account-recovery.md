# Instagram Historical Post Account Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the dead Instagram reauthorization action and safely restore interactions for historic published posts only after exact account identity is established.

**Architecture:** Store an Instagram provider-account identity snapshot on each Instagram post variant and backfill rows whose social account still exists. Resolve engagement through an active account in the same workspace with the exact provider ID; for legacy orphaned variants, provide an explicit manager-only recovery flow that verifies media ownership through the selected account's own-media API before writing the missing snapshot. Keep publishing credentials and `PostVariant.socialAccountId` unchanged.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, Instagram Graph API, React/Next.js, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-04-instagram-historical-post-account-recovery-design.md`

## Global Constraints

- “An account match must be exact and scoped to the same workspace; never match by display name or username.”
- “If the system cannot prove that a connected account owns the historical media, do not attach it automatically.”
- “The original publishing relationship (`PostVariant.socialAccountId`) is not restored as a side effect.”
- “Existing published posts, account records, OAuth credentials, and non-Instagram platforms remain unchanged.”
- “No new Meta permission is silently requested by this change.”
- Never put OAuth credentials or token values in API responses or logs.

## Review Focus

- Existing orphaned posts with no snapshot and a private/removed Instagram post must fail recovery without any database write.
- Two simultaneous recovery attempts selecting different accounts must not overwrite the first verified identity.
- An account with valid publish credentials but missing comment permissions must remain usable for publishing while interaction controls accurately show the missing permission.
- A same-named account in another workspace or a renamed Instagram account must not match a snapshot.
- A provider timeout or rate limit during ownership verification must return a retryable explanation without persisting a match or exhausting memory through unbounded pagination.

---

### Task 1: Persist Instagram account identity on post variants

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`PostVariant`)
- Create: `apps/api/prisma/migrations/<timestamp>_instagram_post_account_identity/migration.sql`
- Modify: `apps/api/src/services/composerService.ts` (account validation query and variant creation)
- Test: `apps/api/tests/instagramPublishedAccountSnapshot.test.ts`
- Test: `apps/api/tests/deploymentMigrationOrder.test.ts`

**Interfaces:**
- Produces nullable `PostVariant.instagramProviderAccountId: String?` mapped to `instagram_provider_account_id`.
- Instagram variants store the selected SocialAccount's `providerAccountId`; all other platforms store `null`.
- Migration backfills existing variants only from a still-present Instagram SocialAccount relation. Orphan rows remain null.

- [x] **Step 1: Write failing tests** in `apps/api/tests/instagramPublishedAccountSnapshot.test.ts` for Instagram snapshot assignment, non-Instagram null behavior, relation backfill SQL, and no backfill for already orphaned rows.
- [x] **Step 2: Run the focused tests and confirm they fail** because the schema, write path, and migration do not yet provide the snapshot.
- [x] **Step 3: Add the nullable schema field and additive migration.** Backfill with an `UPDATE ... FROM social_accounts` join constrained to `platform = 'instagram'`; do not alter `social_account_id` or any publishing data.
- [x] **Step 4: Update `assertVariantsTargetActiveWorkspaceAccounts` to select `providerAccountId`; write that value to `instagramProviderAccountId` only for Instagram variants.** Preserve existing active-workspace/platform validation.
- [x] **Step 5: Run focused tests and Prisma checks.**

Run: `node --import tsx --test apps/api/tests/instagramPublishedAccountSnapshot.test.ts`
Expected: PASS for snapshot and orphan/backfill cases.

Run: `npm run db:generate -w apps/api`
Expected: Prisma client generation exits 0.

Run: `npx prisma validate --schema apps/api/prisma/schema.prisma`
Expected: `The schema ... is valid`.

- [x] **Step 6: Commit** as `feat: preserve Instagram identity on published variants`.

### Task 2: Resolve and verify account identity in engagement APIs

**Files:**
- Modify: `apps/api/src/services/scheduleService.ts` (`publishedPostInclude`, `listPublishedPosts`)
- Modify: `apps/api/src/services/instagramEngagementService.ts` (`PublishedPostRecord`, resolver, recovery method)
- Modify: `apps/api/src/integrations/social/instagramEngagement.ts` (bounded ownership verification via the selected account's media edge)
- Modify: `apps/api/src/controllers/instagramEngagementController.ts`
- Modify: `apps/api/src/routes/instagramEngagementRoutes.ts`
- Test: `apps/api/tests/instagramEngagement.test.ts`
- Test: `apps/api/tests/instagramEngagementRoutes.test.ts`
- Test: `apps/api/tests/instagramPublishedAccountSnapshot.test.ts`

**Interfaces:**
- Consumes Task 1's `PostVariant.instagramProviderAccountId`.
- Engagement resolver selects the active credential by exact `(workspaceId, platform='instagram', providerAccountId)`; legacy existing relation may be used only when it is an active same-workspace Instagram account.
- Recovery endpoint: `POST /workspaces/:workspaceId/instagram/posts/:scheduleId/recover-account`, JSON `{ socialAccountId: string }`.
- Recovery is manager-only, uses the selected account's active credential, verifies the exact published media on that account's own-media edge with a maximum of 20 pages × 50 media IDs, then atomically fills only a null snapshot. It returns a conflict for an existing mismatched snapshot. Reaching the cap without proof fails closed.
- `listPublishedPosts` exposes only a non-sensitive link state (`connected`, `reconnect`, or `legacy_unverified`); it never returns a provider account ID for recovery.

- [x] **Step 1: Write failing service and route tests** for exact same-workspace match, legacy ownership verification success, wrong workspace/platform/role, media absent, missing permission, provider error, and conflicting/concurrent snapshots.
- [x] **Step 2: Run focused API tests and confirm the new expectations fail** before implementation.
- [x] **Step 3: Extend `InstagramEngagementClient` with a bounded own-media verification method.** Request 50 IDs per page, stop immediately on a matching ID, and stop after 20 pages; return false if the cap is reached without proof. Process each page before fetching the next; do not collect all media pages in memory.
- [x] **Step 4: Update `listPublishedPosts` capability resolution** so interaction state is derived from the exact snapshot-matched active account's scopes, while preserving the existing response shape for non-Instagram posts.
- [x] **Step 5: Update `publishedInstagramPost`** to resolve the active account from the provider snapshot when the historical relation is null. Require same workspace, Instagram platform, active status, credential, successful publish job, and non-simulated post exactly as today.
- [x] **Step 6: Add the manager-only recovery service/controller/route.** Accept only the schedule ID and selected account ID; derive `providerPostId` server-side from the successful publish job; verify ownership before a compare-and-set update of a null snapshot.
- [x] **Step 7: Run focused API tests.**

Run: `node --import tsx --test apps/api/tests/instagramEngagement.test.ts apps/api/tests/instagramEngagementRoutes.test.ts apps/api/tests/instagramPublishedAccountSnapshot.test.ts`
Expected: PASS for resolver, authorization, verification, and conflict behavior.

- [x] **Step 8: Commit** as `feat: restore verified Instagram post engagement access`.

### Task 3: Replace inert UI action with explicit account recovery states

**Files:**
- Modify: `apps/web/components/posts/PublishedPostManager.tsx`
- Modify: `apps/web/lib/api.ts` (published-post recovery metadata and social account types)
- Test: `apps/web/tests/instagramEngagementUI.test.ts`

**Interfaces:**
- Consumes Task 2's `POST /workspaces/:workspaceId/instagram/posts/:scheduleId/recover-account` endpoint.
- Current account present + scopes missing: incremental reauthorization is rendered only if an account ID exists and the actor is owner/admin.
- Snapshot exists + no matching account: link to Instagram account management with reconnect-original-account copy.
- Legacy orphan: owner/admin can choose an active Instagram account in the same workspace and request server verification; viewers receive read-only guidance.
- Candidate accounts come from the existing workspace social-accounts endpoint; the recovery endpoint accepts only the internal `socialAccountId` and does not return provider IDs or credentials.
- Permission-not-approved, missing-scope, invalid-token, and webhook-unconfigured UI states remain distinct.

- [x] **Step 1: Write failing UI tests** asserting no inert reauthorization button for absent accounts, explicit recovery selection for legacy orphans, and unchanged publishing UI/independent webhook notice.
- [x] **Step 2: Run the focused UI test and confirm it fails.**
- [x] **Step 3: Implement the account-absent states and recovery interaction.** Load candidate accounts only when the user opens legacy recovery; submit only the selected `socialAccountId`; show verification progress, success, permission failure, provider failure, and conflict without hiding the published post.
- [x] **Step 4: Keep normal reauthorization guarded by a real account ID** and ensure it is not rendered when the authorization route cannot be started.
- [x] **Step 5: Run focused UI test.**

Run: `node --import tsx --test apps/web/tests/instagramEngagementUI.test.ts`
Expected: PASS, including SSR assertions for read-only and manager-visible states.

- [x] **Step 6: Commit** as `fix: make Instagram post recovery actions actionable`.

### Task 4: Full regression and migration safety verification

**Files:**
- No additional production files unless tests reveal a regression.
- Test: full API and Web test suites and deployment migration-order coverage.

**Interfaces:**
- Consumes all three prior tasks; no new public interface.

- [x] **Step 1: Run all API tests.**

Run: `node --import tsx --test apps/api/tests/*.test.ts`
Expected: all API tests pass.

- [x] **Step 2: Run all Web tests.**

Run: `node --import tsx --test apps/web/tests/*.test.ts`
Expected: all Web tests pass.

- [x] **Step 3: Run lint, production build, Prisma generation/validation, deployment migration-order test, and whitespace checks.**

Run: `npm run lint`
Expected: exit 0.

Run: `npm run build`
Expected: API and Web production builds exit 0.

Run: `npm run db:generate -w apps/api; npx prisma validate --schema apps/api/prisma/schema.prisma`
Expected: generation and validation exit 0.

Run: `node --import tsx --test apps/api/tests/deploymentMigrationOrder.test.ts; git diff --check`
Expected: migration ordering test passes and diff check is clean.

- [x] **Step 4: Review final diff for unchanged publish permissions, unchanged `PostVariant.socialAccountId`, no token exposure, and bounded media pagination.**
- [x] **Step 5: Commit any verification-only fixes with their own RED→GREEN tests; otherwise report all test counts and note that deployment requires a separate explicit request.**
