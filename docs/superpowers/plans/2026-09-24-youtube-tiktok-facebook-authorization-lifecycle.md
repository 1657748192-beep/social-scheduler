# YouTube, TikTok, and Facebook Authorization Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep normally expiring YouTube and TikTok authorizations usable, validate Facebook Page authorization, and distinguish revoked access, missing permission, and temporary provider failures without risking duplicate posts.

**Architecture:** Extend the existing encrypted `OauthCredential` record with a separately tracked refresh-token deadline. Give each provider a small, testable token/validation module and a database-backed credential service. Reuse the existing Worker and publisher paths; expose only non-secret warning metadata to the existing account UI.

**Tech Stack:** TypeScript, Node `fetch`, Express, Prisma 6/PostgreSQL, BullMQ Worker, Next.js 15/React 19, Node test runner via `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-24-youtube-tiktok-facebook-authorization-lifecycle-design.md`

## Global Constraints

- Do not change requested OAuth scopes, OAuth callback URLs, or add a new service, email sender, or background queue.
- Keep access and refresh tokens encrypted at rest and out of API responses, browser state, logs, screenshots, and test output.
- `OauthCredential.expiresAt` means access-token expiry only; `refreshTokenExpiresAt` means refresh-token expiry and is nullable when the provider does not report it.
- A known expired refresh token is `token_expired`; revocation or another unrecoverable credential error is `authorization_invalid`; a missing required scope or Page posting permission is `permission_missing`.
- Network errors, 429, 5xx, malformed transient responses, and ambiguous provider errors must leave the account status unchanged and be retried with bounded backoff.
- A failed request made with an old credential may not invalidate an account that another request has just reauthorized or refreshed.
- Never blindly repeat a non-idempotent create-post or create-video request after an ambiguous response.
- Preserve publish-time renewal; add proactive renewal/checks to the existing Worker, with per-account cross-instance serialization for refresh-token rotation.
- Show known refresh-token deadlines in-app at 30 days and 7 days; no email notification in this change.
- Google Auth Platform is shown as External / In production, but the deployed YouTube OAuth client must still be checked against that project before live acceptance testing.

## Review Focus

1. Two TikTok refresh attempts using the same old refresh token must not overwrite the newly rotated token — Task 3 has a concurrent-refresh test.
2. An absent, zero, nonnumeric, or implausible `refresh_expires_in` must not become a false deadline — Task 1 has expiry parsing tests.
3. A YouTube credential without a refresh token must ask for reconnection, not keep trying an expired access token — Task 2 has a missing-refresh-token test.
4. A Meta Page `expires_at` of `0` must remain “unknown/no stated expiry,” not 1970 or a copied User-token date — Task 4 has an expiry normalization test.
5. A timed-out publish-create call must not be submitted again merely because the response was ambiguous — Task 4 tests Facebook error handling, and Task 5 tests the shared Worker retry boundary.

---

## File Map

| File | Responsibility |
| --- | --- |
| `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260924010000_auth_refresh_deadline/migration.sql` | Add nullable refresh-token deadline; clear incorrect legacy Facebook Page access-expiry values. |
| `apps/api/src/integrations/social/oauthExpiry.ts` | Pure, strict conversion from provider duration fields to deadlines. |
| `apps/api/src/services/socialAccountService.ts` | Save deadline from initial OAuth, separate Facebook Page expiry, expose non-secret deadline. |
| `apps/api/src/integrations/social/youtubeTokenRefresh.ts` | Google refresh HTTP call, response validation, error classification. |
| `apps/api/src/integrations/social/youtubeCredentialService.ts` | Serialized YouTube credential resolution, status updates, due-account scan. |
| `apps/api/src/integrations/social/youtubePublisher.ts` | Obtain token from service and classify YouTube upload errors. |
| `apps/api/src/integrations/social/tiktokTokenRefresh.ts` | TikTok refresh HTTP call, token rotation and error classification. |
| `apps/api/src/integrations/social/tiktokCredentialService.ts` | Serialized TikTok credential resolution, status updates, due-account scan. |
| `apps/api/src/integrations/social/tiktokPublisher.ts` | Share credential service between publishing and creator-info lookup; classify permission errors. |
| `apps/api/src/integrations/social/facebookPageCredentialService.ts` | Meta Page token validation, expiry normalization, Page permission checks and status updates. |
| `apps/api/src/integrations/social/facebookPagePublisher.ts` | Validate selected Page before use and classify definite Meta auth/permission failures without retrying ambiguous creates. |
| `apps/api/src/integrations/social/publishOutcomeError.ts` | Mark an uncertain create outcome as non-retryable and explain why the user should check the provider. |
| `apps/api/src/integrations/social/authorizationRefreshWorker.ts`, `apps/api/src/worker.ts` | Run bounded provider scans in the existing Worker with a Redis scan lease and keep publish-time resolution. |
| `apps/web/lib/api.ts`, `apps/web/app/dashboard/page.tsx` | Type and display non-secret deadline warnings in account views. |
| `apps/api/tests/oauthExpiry.test.ts`, `youtubeTokenRefresh.test.ts`, `tiktokTokenRefresh.test.ts`, `facebookPageCredentialService.test.ts`, `authorizationRefreshWorker.test.ts` | Pure behavior and Worker regression tests with fake provider responses. |
| `apps/web/tests/authorizationWarning.test.ts` | Deadline-warning and existing-status presentation tests. |

### Task 1: Persist a separate refresh-token deadline

**Files:**
- Create: `apps/api/src/integrations/social/oauthExpiry.ts`
- Create: `apps/api/tests/oauthExpiry.test.ts`
- Modify: `apps/api/prisma/schema.prisma:225-237`
- Create: `apps/api/prisma/migrations/20260924010000_auth_refresh_deadline/migration.sql`
- Modify: `apps/api/src/services/socialAccountService.ts:25-40,509-635,670-695`

**Interfaces:**
- Produces `expiryFromSeconds(value: unknown, now?: number): Date | null` and `refreshDeadline(platform: Platform, response: { refresh_expires_in?: unknown; refresh_token_expires_in?: unknown }, now?: number): Date | null`.
- Produces optional `OauthCredential.refreshTokenExpiresAt: Date | null` and `listSocialAccounts().credential.refreshTokenExpiresAt`.

- [ ] **Step 1: Write failing parsing tests.** In `oauthExpiry.test.ts`, add tests like:

  ```ts
  assert.equal(refreshDeadline("tiktok", { refresh_expires_in: 31536000 }, 0)?.toISOString(), "1971-01-01T00:00:00.000Z");
  assert.equal(refreshDeadline("youtube", { refresh_token_expires_in: 604800 }, 0)?.getTime(), 604800000);
  for (const value of [undefined, 0, -1, "3600", Number.NaN, Number.POSITIVE_INFINITY, 1e20]) {
    assert.equal(expiryFromSeconds(value, 0), null);
  }
  assert.equal(refreshDeadline("facebook", { refresh_expires_in: 3600 }, 0), null);
  ```

- [ ] **Step 2: Run** `npx tsx --test apps/api/tests/oauthExpiry.test.ts`. Expect failure because the module is absent.
- [ ] **Step 3: Implement strict duration conversion and schema migration.** Use a finite positive numeric guard before multiplying seconds; for the two supported providers, select only their documented field name. The helper's central branch should be:

  ```ts
  export function expiryFromSeconds(value: unknown, now = Date.now()): Date | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
    const timestamp = now + value * 1000;
    return Number.isFinite(timestamp) && Math.abs(timestamp) <= 8.64e15
      ? new Date(timestamp) : null;
  }
  export function refreshDeadline(platform: Platform, response: {
    refresh_expires_in?: unknown; refresh_token_expires_in?: unknown
  }, now = Date.now()): Date | null {
    if (platform === "tiktok") return expiryFromSeconds(response.refresh_expires_in, now);
    if (platform === "youtube") return expiryFromSeconds(response.refresh_token_expires_in, now);
    return null;
  }
  ```

  Add to Prisma:

  ```prisma
  refreshTokenExpiresAt DateTime? @map("refresh_token_expires_at")
  ```

  Migration must add the column and remove the copied User-token expiry from existing Facebook Page credentials:

  ```sql
  ALTER TABLE oauth_credentials ADD COLUMN refresh_token_expires_at TIMESTAMP(3);
  UPDATE oauth_credentials AS oc SET expires_at = NULL
  FROM social_accounts AS sa
  WHERE oc.social_account_id = sa.id AND sa.platform = 'facebook' AND sa.account_type = 'page';
  ```

  Extend `TokenResponse` with `refresh_expires_in?: number` and `refresh_token_expires_in?: number`. On initial OAuth save the new deadline (or null). For Facebook Page upsert, write `expiresAt: null` until the Page token itself is checked; never copy `credentialTokenResponse.expires_in`. Add only `refreshTokenExpiresAt` to the credential projection returned by `listSocialAccounts`.

- [ ] **Step 4: Run** `npx tsx --test apps/api/tests/oauthExpiry.test.ts`, `npm run db:generate -w apps/api`, `npx prisma validate --schema apps/api/prisma/schema.prisma`, and `npm run lint -w apps/api`. Expect all pass.
- [ ] **Step 5: Commit** these exact Task 1 files with `git commit -m "feat: store provider refresh-token deadlines"`.

### Task 2: Make YouTube refresh safe and reusable

**Files:**
- Create: `apps/api/src/integrations/social/youtubeTokenRefresh.ts`
- Create: `apps/api/src/integrations/social/youtubeCredentialService.ts`
- Create: `apps/api/tests/youtubeTokenRefresh.test.ts`
- Modify: `apps/api/src/integrations/social/youtubePublisher.ts:1-155,190-240`

**Interfaces:**
- Consumes `expiryFromSeconds` / `refreshDeadline` from Task 1.
- Produces `getYouTubeAccountAccessToken(accountId: string, requiredScope?: string): Promise<string>`, `refreshDueYouTubeAccounts(): Promise<number>`, and `classifyYouTubeFailure(status: number, reason?: string): "authorization_invalid" | "permission_missing" | "temporary_failure" | "request_failed"`.

- [ ] **Step 1: Write failing tests** with fake `fetch` responses for successful refresh, `invalid_grant`, 429, 503, timeout, missing refresh token, a missing access-token expiry, `youtube.upload` missing, and an old access token that cannot invalidate a newly connected account. Pin the classifications explicitly:

  ```ts
  assert.equal(classifyYouTubeFailure(400, "invalid_grant"), "authorization_invalid");
  assert.equal(classifyYouTubeFailure(403, "insufficientPermissions"), "permission_missing");
  assert.equal(classifyYouTubeFailure(429), "temporary_failure");
  assert.equal(classifyYouTubeFailure(503), "temporary_failure");
  ```

- [ ] **Step 2: Run** `npx tsx --test apps/api/tests/youtubeTokenRefresh.test.ts`. Expect failure because the new module is absent.
- [ ] **Step 3: Implement** `refreshYouTubeToken({ refreshToken, clientId, clientSecret, fetcher? })` around `POST https://oauth2.googleapis.com/token` using `grant_type=refresh_token`, a 10-second timeout, and a discriminated result (`success` with access token and `expiresIn`; `authorization_invalid`; `temporary_failure`). The request body must contain exactly the OAuth fields, not the app user's credentials:

  ```ts
  const body = new URLSearchParams({
    grant_type: "refresh_token", refresh_token: refreshToken,
    client_id: clientId, client_secret: clientSecret
  });
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body, signal: AbortSignal.timeout(10000)
  });
  ```

  Save any returned new refresh token and deadline; when Google omits a new refresh token, keep the previous token and deadline. Reject nonpositive/missing `expires_in` as a temporary/incomplete response, not a successful renewal.
- [ ] **Step 4: Implement** `getYouTubeAccountAccessToken` with a PostgreSQL row lock on `social_accounts.id`, then reload the credential and check `status=active`, required scope, `expiresAt`, and refresh availability. Hold the lock through refresh and credential update, as the Pinterest credential service currently does; use a bounded transaction timeout. The lock begins before reading the credential:

  ```ts
  await tx.$queryRaw`SELECT id FROM social_accounts WHERE id = ${accountId}::uuid FOR UPDATE`;
  const account = await tx.socialAccount.findUnique({
    where: { id: accountId }, include: { credential: true }
  });
  ```

  Use conditional status updates so a request using an old token cannot invalidate a replacement. `refreshDueYouTubeAccounts` selects active YouTube accounts whose access token expires within 40 minutes **or has no recorded expiry**, paginates rather than loading an unbounded set, and calls the same resolver. Replace `YouTubePublisher.getAccessToken` with this service. For upload-session and upload-result errors, use machine-readable Google reasons; do not classify `quotaExceeded`, `uploadLimitExceeded`, file errors, or transient errors as authorization failure.
- [ ] **Step 5: Run** the focused test and `npm run lint -w apps/api`; expect pass. Commit the Task 2 files with `git commit -m "feat: renew YouTube authorization safely"`.

### Task 3: Rotate TikTok tokens without false expiration

**Files:**
- Create: `apps/api/src/integrations/social/tiktokTokenRefresh.ts`
- Create: `apps/api/src/integrations/social/tiktokCredentialService.ts`
- Create: `apps/api/tests/tiktokTokenRefresh.test.ts`
- Modify: `apps/api/src/integrations/social/tiktokPublisher.ts:1-55,180-315,325-425`

**Interfaces:**
- Consumes Task 1's `refreshTokenExpiresAt` and `refreshDeadline`.
- Produces `getTikTokAccountAccessToken(accountId: string, requiredScope?: string): Promise<string>`, `refreshDueTikTokAccounts(): Promise<number>`, and `classifyTikTokTokenFailure(status: number, error?: string): "authorization_invalid" | "temporary_failure" | "request_failed"`. Expose the core `resolveTikTokAccessToken` with injected `withLock` and `exchange` dependencies so concurrency is testable without production tokens or a live database.

- [ ] **Step 1: Write failing tests** for access-token expiry, missing access-token expiry, rotated refresh-token persistence, returned `refresh_expires_in`, no refresh token, explicit `invalid_grant`, 429/503/timeout, missing `video.publish`, recovery of an old false `token_expired` status, and two simultaneous refresh requests. The concurrency test must assert that the second call observes the first call's newly saved credential and that exactly one provider refresh request uses the old refresh token:

  ```ts
  assert.equal(classifyTikTokTokenFailure(400, "invalid_grant"), "authorization_invalid");
  assert.equal(classifyTikTokTokenFailure(429, "rate_limit_exceeded"), "temporary_failure");
  assert.equal(classifyTikTokTokenFailure(503), "temporary_failure");
  ```

- [ ] **Step 2: Run** `npx tsx --test apps/api/tests/tiktokTokenRefresh.test.ts`. Expect failure because the new module is absent.
- [ ] **Step 3: Implement** `refreshTikTokToken({ refreshToken, clientKey, clientSecret, fetcher? })` against `POST https://open.tiktokapis.com/v2/oauth/token/`, validate both new access token and positive `expires_in`, and classify TikTok OAuth error codes. Its success result is `{ kind: "success", accessToken: string, refreshToken?: string, expiresIn: number, refreshExpiresIn?: number }`. Use the v2 body:

  ```ts
  const body = new URLSearchParams({
    grant_type: "refresh_token", refresh_token: refreshToken,
    client_key: clientKey, client_secret: clientSecret
  });
  ```

  Use `refresh_expires_in` to update the deadline. If refresh succeeds without a replacement refresh token, preserve the old token but do not invent a new expiry.
- [ ] **Step 4: Implement** a serialized `getTikTokAccountAccessToken`: put state transitions in `resolveTikTokAccessToken({ accountId, requiredScope, withLock, exchange })`; the production `withLock` row-locks the account and reloads credential/status, while tests supply an in-memory serializing lock. Check `video.publish` only when requested, refresh if due, atomically save new encrypted access/refresh tokens and both deadlines, then release. The successful update must include both token fields in one write:

  ```ts
  await tx.oauthCredential.update({ where: { id: credential.id }, data: {
    accessTokenEncrypted: encryptToken(result.accessToken),
    refreshTokenEncrypted: result.refreshToken
      ? encryptToken(result.refreshToken) : credential.refreshTokenEncrypted,
    expiresAt: expiryFromSeconds(result.expiresIn),
    refreshTokenExpiresAt: result.refreshExpiresIn
      ? expiryFromSeconds(result.refreshExpiresIn) : credential.refreshTokenExpiresAt
  } });
  ```

  If the known refresh deadline has passed, set `token_expired`; on explicit revocation set `authorization_invalid`; on transient failure keep the previous status. Permit an existing `token_expired` account to recover through a successful refresh when its refresh token is still valid, then restore `active`. Update `tiktokPublisher.publish` and `getCreatorPublishInfo` to call this service. Map definite TikTok `scope_not_authorized`/missing-permission responses to `permission_missing` without conflating ordinary creator-account privacy restrictions with missing OAuth scope. The due scan selects `active` and recoverable `token_expired` accounts within 8 hours of access-token expiry or with no recorded access expiry, in bounded batches.
- [ ] **Step 5: Run** the focused test, existing `apps/api/tests/tiktokPublishedPostLink.test.ts`, and `npm run lint -w apps/api`; expect pass. Commit Task 3 files with `git commit -m "feat: renew TikTok tokens and preserve rotated refresh tokens"`.

### Task 4: Validate Facebook Page credentials independently

**Files:**
- Create: `apps/api/src/integrations/social/facebookPageCredentialService.ts`
- Create: `apps/api/tests/facebookPageCredentialService.test.ts`
- Modify: `apps/api/src/integrations/social/facebookPagePublisher.ts:1-120,250-270`
- Modify: `apps/api/src/services/socialAccountService.ts:223-290,519-580`

**Interfaces:**
- Produces `getFacebookPageAccessToken(accountId: string): Promise<string>`, `checkDueFacebookPages(): Promise<number>`, `normalizeFacebookPageExpiry(unixSeconds: unknown): Date | null`, and `classifyFacebookPageFailure(status: number, code?: number): "authorization_invalid" | "permission_missing" | "temporary_failure" | "request_failed"`.

- [ ] **Step 1: Write failing tests** for valid Page token with `expires_at=0`, a finite Page-specific expiry, Meta error code 190 (invalid), code 10/200 (permission), 429/5xx (temporary), a Page ID mismatch, a revoked Page role, and a failed create-post response that is not blindly retried:

  ```ts
  assert.equal(normalizeFacebookPageExpiry(0), null);
  assert.equal(classifyFacebookPageFailure(400, 190), "authorization_invalid");
  assert.equal(classifyFacebookPageFailure(403, 200), "permission_missing");
  assert.equal(classifyFacebookPageFailure(503, 190), "temporary_failure");
  ```

- [ ] **Step 2: Run** `npx tsx --test apps/api/tests/facebookPageCredentialService.test.ts`. Expect failure because the module is absent.
- [ ] **Step 3: Implement** `checkFacebookPageCredential` using Meta's `/debug_token` response with an app credential held only server-side, plus a lightweight Page identity/permission check for the selected Page. Validate `is_valid`, token type/Page identity, Page ID, and required posting permissions; treat `expires_at=0` or absent as `null`, and use a finite provider Page expiry when supplied. The normalization is:

  ```ts
  export function normalizeFacebookPageExpiry(value: unknown): Date | null {
    return typeof value === "number" && Number.isFinite(value) && value > 0 && value * 1000 <= 8.64e15
      ? new Date(value * 1000) : null;
  }
  ```

  Never copy the 60-day User token expiry. Avoid token-bearing URLs in application logs. A transient Meta error leaves account `active`; a definite revocation/permission failure updates status only if the checked credential is still current.
- [ ] **Step 4: Wire** the validator into `FacebookPagePublisher` before using the Page token, and classify explicit Graph API auth/permission errors from `/feed`, `/photos`, and `/videos`. For the non-idempotent request, pass the parsed `error.code` to `classifyFacebookPageFailure(response.status, payload?.error?.code)`; do not retry a create call whose outcome is uncertain. `checkDueFacebookPages` iterates active Page accounts in bounded batches; it must not refresh or overwrite Page tokens, because this flow has no Facebook refresh token.
- [ ] **Step 5: Run** the focused test and `npm run lint -w apps/api`; expect pass. Commit Task 4 files with `git commit -m "feat: validate Facebook Page authorization"`.

### Task 5: Schedule the three provider checks in the existing Worker

**Files:**
- Create: `apps/api/src/integrations/social/authorizationRefreshWorker.ts`
- Create: `apps/api/src/integrations/social/publishOutcomeError.ts`
- Modify: `apps/api/src/worker.ts:1-15,205-240`
- Modify: `apps/api/src/integrations/social/youtubePublisher.ts:190-240`
- Modify: `apps/api/src/integrations/social/tiktokPublisher.ts:375-425`
- Modify: `apps/api/src/integrations/social/facebookPagePublisher.ts:95-270`
- Create: `apps/api/tests/authorizationRefreshWorker.test.ts`

**Interfaces:**
- Consumes `refreshDueYouTubeAccounts`, `refreshDueTikTokAccounts`, and `checkDueFacebookPages` from Tasks 2–4.
- Keeps the existing Pinterest/Instagram timers and publish queue intact.
- Produces `runAuthorizationChecks(checks: { youtube: () => Promise<number>; tiktok: () => Promise<number>; facebook: () => Promise<number> }, withLease: (platform: "youtube" | "tiktok" | "facebook", check: () => Promise<number>) => Promise<number | null>): Promise<{ youtube: number; tiktok: number; facebook: number }>` and exported interval constants. A null lease result means another Worker already owns that scan.

- [ ] **Step 1: Write failing scheduler tests** around an injectable scan runner that proves: one provider failure does not stop the next provider, no secret appears in errors, the exported intervals are 30 minutes / 6 hours / 24 hours, and overlapping ticks or two Worker instances do not launch a second scan for the same provider. Define `youtube`, `tiktok`, and `facebook` in the test as async functions returning 1, 0, and 2. A representative assertion:

  ```ts
  const withLease = async (_platform: string, check: () => Promise<number>) => check();
  assert.deepEqual(await runAuthorizationChecks({ youtube, tiktok, facebook }, withLease), {
    youtube: 1, tiktok: 0, facebook: 2
  });
  ```

- [ ] **Step 2: Run** `npx tsx --test apps/api/tests/authorizationRefreshWorker.test.ts`. Expect failure because the runner is absent.
- [ ] **Step 3: Implement** a small `authorizationRefreshWorker.ts` runner and register it from the existing `worker.ts`: YouTube every 30 minutes, TikTok every 6 hours, Facebook every 24 hours. Run a startup pass, but guard each provider scan with the existing Redis connection using `SET auth-refresh:<provider> <random-owner> NX PX 1800000`; release only if the stored owner still matches (Lua compare-and-delete). Limit each scan to at most 100 accounts so it finishes within the 30-minute lease. Keep per-account row locks/conditional writes in Tasks 2–4 as the second line of defense. An exported interval contract keeps tests independent of real timers:

  ```ts
  export const authorizationRefreshIntervalsMs = {
    youtube: 30 * 60_000, tiktok: 6 * 60 * 60_000, facebook: 24 * 60 * 60_000
  } as const;
  ```

  Log counts, account IDs only when diagnosing failure, and error categories; never log tokens or provider request URLs containing tokens. Keep scans bounded and let each account failure be reported without aborting the batch.
- [ ] **Step 4: Prevent blind retries after uncertain creates.** Add `PublishOutcomeUnknownError` extending BullMQ `UnrecoverableError`; wrap network timeouts or ambiguous responses after Facebook feed/photo/video creation, TikTok publish initialization, and YouTube video upload (not the safe pre-upload session setup). The message should direct the user to check the provider before reposting. The Worker failed handler must compute terminal status with:

  ```ts
  const hasRemainingAttempts = !(error instanceof UnrecoverableError)
    && job.attemptsMade < (job.opts.attempts ?? 1);
  ```

  Test that a synthetic `PublishOutcomeUnknownError` yields a failed/dead schedule without a queued retry, while a definite pre-create network failure retains the existing bounded retry behavior.
- [ ] **Step 5: Run** focused tests, `npm run lint -w apps/api`, and `npm run build -w apps/api`; expect pass. Commit Task 5 files with `git commit -m "feat: check social authorizations in worker"`.

### Task 6: Show a safe reconnect warning before known refresh expiry

**Files:**
- Modify: `apps/web/lib/api.ts:216-235`
- Create: `apps/web/lib/authorizationWarning.ts`
- Create: `apps/web/tests/authorizationWarning.test.ts`
- Modify: `apps/web/app/dashboard/page.tsx:650-775`

**Interfaces:**
- Consumes non-secret `credential.refreshTokenExpiresAt` from Task 1.
- Produces `authorizationWarning(account: SocialAccount, now?: number): "soon" | "urgent" | "expired" | null`.

- [ ] **Step 1: Write failing UI tests** for a deadline 31 days away (no warning), 30 days away (`soon`), 7 days away (`urgent`), already past (`expired`), null deadline (no warning), nonactive account (existing status wins), and malformed timestamps (no false warning):

  ```ts
  const now = Date.parse("2026-09-24T00:00:00.000Z");
  const accountWithDeadline = (days: number) => ({
    status: "active",
    credential: { refreshTokenExpiresAt: new Date(now + days * 86400000).toISOString() }
  }) as SocialAccount;
  assert.equal(authorizationWarning(accountWithDeadline(7), now), "urgent");
  assert.equal(authorizationWarning(accountWithDeadline(31), now), null);
  assert.equal(authorizationWarning(accountWithDeadline(-1), now), "expired");
  ```

- [ ] **Step 2: Run** `npx tsx --test apps/web/tests/authorizationWarning.test.ts`. Expect failure because the helper is absent.
- [ ] **Step 3: Implement** the pure helper and add `refreshTokenExpiresAt?: string | null` to the credential type. The helper should return null for invalid timestamps and nonactive accounts, `expired` after the known deadline, `urgent` at seven days or less, and `soon` at 30 days or less:

  ```ts
  if (account.status !== "active" || !account.credential?.refreshTokenExpiresAt) return null;
  const remaining = new Date(account.credential.refreshTokenExpiresAt).getTime() - now;
  if (!Number.isFinite(remaining) || remaining > 30 * 86400000) return null;
  if (remaining <= 0) return "expired";
  return remaining <= 7 * 86400000 ? "urgent" : "soon";
  ```

  In both dashboard account rows and binding modal, show bilingual text via `t(zh, en)`, e.g. “续期凭证即将到期，请重新连接账号” / “Renewal credential expires soon. Reconnect this account.” For `expired`, say “续期凭证已到期，请重新连接账号” / “Renewal credential expired. Reconnect this account.” Keep `accountStatusLabel` and existing primary status unchanged; no secrets or refresh-token value should reach the client.
- [ ] **Step 4: Run** the focused test, existing `apps/web/tests/statusLabelLocalization.test.ts`, `npm run lint -w apps/web`, and `npm run build -w apps/web`; expect pass. Commit Task 6 files with `git commit -m "feat: warn before social renewal credential expiry"`.

### Task 7: Regression and release evidence

**Files:**
- Modify only if a test finds a specific defect in the Task 1–6 files.
- Verify: `docs/SERVER_MAINTENANCE.md`, `scripts/deploy-server.sh`, `docker-compose.server.yml` before using the existing deployment workflow.

- [ ] **Step 1: Run full automated verification.** Run `npx tsx --test apps/api/tests/*.test.ts`, `npx tsx --test apps/web/tests/*.test.ts`, `npm run lint`, and `npm run build`. Fix only concrete failures, rerun the affected focused test, then rerun the full suite.
- [ ] **Step 2: Run database compatibility checks.** Run `npx prisma validate --schema apps/api/prisma/schema.prisma` and inspect the migration SQL. Verify existing encrypted tokens survive the migration and only Facebook Page's incorrectly copied `expires_at` becomes null.
- [ ] **Step 3: Review non-idempotent failure paths.** With fake 401/403/429/timeout responses to YouTube upload-session, TikTok publish-init/status, and Facebook feed/photo/video creation, assert that definitive auth failures update status, transient/unknown results do not, and a timed-out create call is not submitted a second time by credential recovery. Check the existing BullMQ retry policy and adjust only when a replay could duplicate a post.
- [ ] **Step 4: Review configuration and secrets.** Confirm the live YouTube OAuth client belongs to the Google Auth Platform project shown as External / In production; check that TikTok and Meta credentials are configured without printing their values. Confirm no token-bearing body or URL is included in logs or frontend payloads.
- [ ] **Step 5: Prepare deployment verification.** Use the existing server runbook and deployment script only after implementation review and deployment authorization. Check migration deployment, API/Worker/Web container health, `https://app.bufferhelp.com/api/v1/health`, and one controlled connection/refresh or Page-check per provider. If a live test cannot be performed safely, report that limitation rather than claiming production verification. Commit any Task 7 regression fix separately.

## Execution Notes

Each task follows red → green → review → commit. Keep unrelated existing files and untracked user files untouched. Provider-facing tests must use fake responses; never use production access or refresh tokens in automated tests. Do not push or deploy during planning.
