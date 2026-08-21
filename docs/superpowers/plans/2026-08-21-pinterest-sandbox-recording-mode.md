# Pinterest Sandbox Recording Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Pinterest Trial-access app complete a safe Sandbox OAuth, board-creation, and image-Pin flow for the Standard-access review recording without sending Sandbox credentials to production.

**Architecture:** A small Pinterest environment module owns the production/Sandbox API URL mapping and the account-capability environment marker. OAuth and the Pinterest publisher use that module, while the publisher rejects a connected account whose stored environment differs from the current server setting. A manager-only board-creation endpoint powers the Sandbox-only empty-board helper in the composer.

**Tech Stack:** TypeScript, Express, Zod, Prisma, Next.js/React, Node test runner (`tsx --test`), Pinterest API v5.

**Spec:** `docs/superpowers/specs/2026-08-21-pinterest-sandbox-recording-design.md`

## Global Constraints

- `PINTEREST_API_ENV` accepts exactly `production` or `sandbox` and defaults to `production`.
- Production calls `https://api.pinterest.com/v5`; Sandbox calls `https://api-sandbox.pinterest.com/v5` for token exchange, profile lookup, boards, and Pins.
- Pinterest browser authorization remains `https://www.pinterest.com/oauth/` in both environments.
- Every newly connected Pinterest account records its environment in `SocialAccount.capabilities.pinterestApiEnvironment`.
- An account from the other environment must receive a reconnect error; never send that token to the selected environment.
- Sandbox UI labels must explicitly say `Pinterest Sandbox test mode`; production must not show that label.
- Pinterest publishing remains exactly one image plus a board and a Pin title.
- Never commit `.env` values or API credentials.

---

## File Structure

- Create `apps/api/src/integrations/social/pinterestEnvironment.ts` — Pinterest API environment type, v5 endpoint builder, capability reader, and mismatch error helper.
- Modify `apps/api/src/config.ts` — validate `PINTEREST_API_ENV` at process startup.
- Modify `apps/api/src/integrations/oauth/oauthProviders.ts` — build Pinterest token/profile URLs from the active environment and expose the active environment in OAuth status.
- Modify `apps/api/src/services/socialAccountService.ts` — persist the environment during Pinterest OAuth and authorize board creation for workspace managers.
- Modify `apps/api/src/integrations/social/pinterestPublisher.ts` — use the shared base URL, reject mismatched connections, and create a public test board.
- Modify `apps/api/src/controllers/socialAccountController.ts` and `apps/api/src/routes/socialAccountRoutes.ts` — add the authenticated `POST .../pinterest-boards` route.
- Modify `apps/api/tests/pinterestPublisher.test.ts` and create `apps/api/tests/pinterestSandboxEnvironment.test.ts` — cover endpoint selection, mismatch safety, and board creation route wiring.
- Modify `.env.example` — document the non-secret Pinterest environment switch.
- Modify `apps/web/lib/api.ts` — type the Pinterest environment in OAuth status and the `POST` board response.
- Modify `apps/web/components/composer/ComposerForm.tsx` — pass stored account environments to Pinterest settings and create/select a newly created Sandbox board.
- Modify `apps/web/components/composer/PinterestPinSettings.tsx` — render the Sandbox notice and board form only for Sandbox accounts with no boards.
- Modify `apps/web/tests/pinterestComposer.test.ts` — lock down the label, board-create endpoint, and production-safe UI wiring.

## Task 1: Define the Pinterest environment contract and wire OAuth to it

**Files:**
- Create: `apps/api/src/integrations/social/pinterestEnvironment.ts`
- Modify: `apps/api/src/config.ts:69-70`
- Modify: `apps/api/src/integrations/oauth/oauthProviders.ts:17-46,176-197,215-301`
- Modify: `apps/api/src/services/socialAccountService.ts:539-637`
- Modify: `.env.example:66-67`
- Test: `apps/api/tests/pinterestSandboxEnvironment.test.ts`

**Interfaces:**
- Produces `PinterestApiEnvironment`, `pinterestApiBaseUrl(environment)`, `pinterestOAuthTokenUrl(environment)`, `pinterestProfileUrl(environment)`, `readPinterestAccountEnvironment(capabilities)`, and `assertPinterestAccountEnvironment(capabilities, activeEnvironment)`.
- Produces `OAuthProviderStatus.pinterestApiEnvironment?: PinterestApiEnvironment`; only the Pinterest status contains that property.
- Produces `SocialAccount.capabilities.pinterestApiEnvironment` for new or reconnected Pinterest accounts.

- [ ] **Step 1: Write failing URL-selection and mismatch-protection tests**

Create `apps/api/tests/pinterestSandboxEnvironment.test.ts` with direct unit tests for both URL roots and the environment marker:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPinterestAccountEnvironment,
  pinterestApiBaseUrl,
  pinterestOAuthTokenUrl,
  pinterestProfileUrl
} from "../src/integrations/social/pinterestEnvironment";

test("uses Pinterest production URLs by default contract", () => {
  assert.equal(pinterestApiBaseUrl("production"), "https://api.pinterest.com/v5");
  assert.equal(pinterestOAuthTokenUrl("production"), "https://api.pinterest.com/v5/oauth/token");
  assert.equal(pinterestProfileUrl("production"), "https://api.pinterest.com/v5/user_account");
});

test("uses Pinterest Sandbox URLs only for server-side v5 calls", () => {
  assert.equal(pinterestApiBaseUrl("sandbox"), "https://api-sandbox.pinterest.com/v5");
  assert.equal(pinterestOAuthTokenUrl("sandbox"), "https://api-sandbox.pinterest.com/v5/oauth/token");
  assert.equal(pinterestProfileUrl("sandbox"), "https://api-sandbox.pinterest.com/v5/user_account");
});

test("refuses a Pinterest token connected for another environment", () => {
  assert.throws(
    () => assertPinterestAccountEnvironment({ pinterestApiEnvironment: "production" }, "sandbox"),
    /Reconnect the Pinterest account/
  );
});
```

- [ ] **Step 2: Run the new test and verify it fails because the environment module does not exist**

Run:

```bash
cd apps/api
npx tsx --test tests/pinterestSandboxEnvironment.test.ts
```

Expected: test load failure for `pinterestEnvironment`.

- [ ] **Step 3: Implement the small environment module**

Create `apps/api/src/integrations/social/pinterestEnvironment.ts` with the exact exported API from Step 1. Its core implementation must use these values and reject a missing legacy capability too:

```ts
export type PinterestApiEnvironment = "production" | "sandbox";

const apiRoots: Record<PinterestApiEnvironment, string> = {
  production: "https://api.pinterest.com/v5",
  sandbox: "https://api-sandbox.pinterest.com/v5"
};

export function pinterestApiBaseUrl(environment: PinterestApiEnvironment) {
  return apiRoots[environment];
}

export function pinterestOAuthTokenUrl(environment: PinterestApiEnvironment) {
  return `${pinterestApiBaseUrl(environment)}/oauth/token`;
}

export function pinterestProfileUrl(environment: PinterestApiEnvironment) {
  return `${pinterestApiBaseUrl(environment)}/user_account`;
}
```

`readPinterestAccountEnvironment` must return `"production"`, `"sandbox"`, or `undefined` after safely inspecting a Prisma JSON value. `assertPinterestAccountEnvironment` must throw this actionable message whenever the marker is missing or differs:

```ts
"This Pinterest account was connected for a different API environment. Reconnect the Pinterest account after changing PINTEREST_API_ENV."
```

- [ ] **Step 4: Validate configuration and update provider construction**

In `apps/api/src/config.ts`, append this schema field immediately after the Pinterest credentials:

```ts
PINTEREST_API_ENV: z.enum(["production", "sandbox"]).default("production")
```

In `.env.example`, document the default without a credential:

```dotenv
# Use sandbox only while recording/testing Pinterest review flow; reconnect Pinterest after changing it.
PINTEREST_API_ENV=production
```

In `oauthProviders.ts`, import `pinterestOAuthTokenUrl`, `pinterestProfileUrl`, and `PinterestApiEnvironment`; replace the two hard-coded Pinterest v5 URLs with calls using `config.PINTEREST_API_ENV`. Extend `OAuthProviderStatus` with optional `pinterestApiEnvironment`, then include it in the Pinterest object returned by `listOAuthProviderStatuses`.

- [ ] **Step 5: Persist the environment during OAuth account upsert**

In the normal-account branch of `completeOAuth` in `socialAccountService.ts`, build capabilities once and use the same object for `create` and `update`:

```ts
const capabilities = {
  oauth2: true,
  scopes,
  ...(provider.platform === "pinterest"
    ? { pinterestApiEnvironment: config.PINTEREST_API_ENV }
    : {})
};
```

Use `capabilities` in both account-upsert branches for the normal profile path. Do not alter the Facebook Page-specific capabilities block.

- [ ] **Step 6: Run focused tests and type checks**

Run:

```bash
cd apps/api
npx tsx --test tests/pinterestSandboxEnvironment.test.ts tests/pinterestPublisher.test.ts
npm run lint
```

Expected: all selected tests pass and TypeScript reports no errors.

- [ ] **Step 7: Commit the isolated environment/OAuth contract**

```bash
git add .env.example apps/api/src/config.ts apps/api/src/integrations/social/pinterestEnvironment.ts apps/api/src/integrations/oauth/oauthProviders.ts apps/api/src/services/socialAccountService.ts apps/api/tests/pinterestSandboxEnvironment.test.ts
git commit -m "feat: add Pinterest API environment safety"
```

### Task 2: Use the environment contract for boards and Pins, including test-board creation

**Files:**
- Modify: `apps/api/src/integrations/social/pinterestPublisher.ts:1-157`
- Modify: `apps/api/src/services/socialAccountService.ts:19-28,705-712`
- Modify: `apps/api/src/controllers/socialAccountController.ts:1-46`
- Modify: `apps/api/src/routes/socialAccountRoutes.ts:1-66`
- Modify: `apps/api/tests/pinterestPublisher.test.ts`
- Modify: `apps/api/tests/pinterestSandboxEnvironment.test.ts`

**Interfaces:**
- Consumes `PinterestApiEnvironment` helpers from Task 1.
- Produces `PinterestPublisher.createBoard(workspaceId: string, socialAccountId: string, name: string): Promise<PinterestBoard>`.
- Produces `createPinterestBoard(userId, workspaceId, socialAccountId, { name }): Promise<PinterestBoard>`.
- Produces `POST /api/v1/workspaces/:workspaceId/social-accounts/:socialAccountId/pinterest-boards` with JSON body `{ "name": "Social Scheduler Sandbox Test" }`.

- [ ] **Step 1: Write failing request-shape and route-authorization tests**

Append this direct test to `apps/api/tests/pinterestPublisher.test.ts` after importing `buildPinterestCreateBoardBody` from `pinterestPublishing.ts`:

```ts
test("builds a public Pinterest Sandbox test board request", () => {
  assert.deepEqual(buildPinterestCreateBoardBody("Social Scheduler Sandbox Test"), {
    name: "Social Scheduler Sandbox Test",
    privacy: "PUBLIC"
  });
});
```

Add this source-level route contract test to `apps/api/tests/pinterestSandboxEnvironment.test.ts`:

```ts
test("creates Pinterest boards only through an authenticated workspace-manager route", async () => {
  const service = await readFile(new URL("../src/services/socialAccountService.ts", import.meta.url), "utf8");
  const controller = await readFile(new URL("../src/controllers/socialAccountController.ts", import.meta.url), "utf8");
  const routes = await readFile(new URL("../src/routes/socialAccountRoutes.ts", import.meta.url), "utf8");

  assert.match(service, /export async function createPinterestBoard/);
  assert.match(service, /requireWorkspaceManager\(userId, workspaceId\)/);
  assert.match(controller, /createPinterestBoardController/);
  assert.match(routes, /social-accounts\/:socialAccountId\/pinterest-boards/);
  assert.match(routes, /asyncHandler\(createPinterestBoardController\)/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing board-create helper**

Run:

```bash
cd apps/api
npx tsx --test tests/pinterestPublisher.test.ts tests/pinterestSandboxEnvironment.test.ts
```

Expected: failure because `buildPinterestCreateBoardBody` and the create-board route are absent.

- [ ] **Step 3: Add the request helper and publisher method**

In `apps/api/src/integrations/social/pinterestPublishing.ts`, add the exported body helper:

```ts
export function buildPinterestCreateBoardBody(name: string) {
  return { name, privacy: "PUBLIC" as const };
}
```

In `PinterestPublisher`, replace the module-level `pinterestApiBaseUrl` constant with `pinterestApiBaseUrl(config.PINTEREST_API_ENV)`. Immediately after `findPinterestAccount` in `listBoards`, `publish`, and new `createBoard`, call:

```ts
assertPinterestAccountEnvironment(account?.capabilities, config.PINTEREST_API_ENV);
```

Implement `createBoard` by obtaining `boards:write`, posting `buildPinterestCreateBoardBody(name)` to `${pinterestApiBaseUrl(config.PINTEREST_API_ENV)}/boards`, and returning the response only when `id` and `name` are present. Use `describePinterestApiError(payload, "Pinterest board creation failed (...)")` for a non-2xx response or malformed payload.

- [ ] **Step 4: Add the service schema, controller, and manager-only POST route**

Add this exported schema near the existing authorization schemas in `socialAccountService.ts`:

```ts
export const createPinterestBoardSchema = z.object({
  name: z.string().trim().min(1).max(180)
});
```

Add `createPinterestBoard` that calls `requireWorkspaceManager(userId, workspaceId)` and delegates to `new PinterestPublisher().createBoard(workspaceId, socialAccountId, input.name)`.

In the controller, parse `createPinterestBoardSchema.parse(req.body)` and return `res.status(201).json(board)`. Register the `POST` route at the same Pinterest-board URL after the existing `GET`, protected by `requireAuth` and `asyncHandler`.

- [ ] **Step 5: Run targeted server-side tests and lint**

Run:

```bash
cd apps/api
npx tsx --test tests/pinterestPublisher.test.ts tests/pinterestPublishing.test.ts tests/pinterestSandboxEnvironment.test.ts
npm run lint
```

Expected: board body, environment mismatch, pagination, and route contract tests all pass.

- [ ] **Step 6: Commit the publisher and board API**

```bash
git add apps/api/src/integrations/social/pinterestPublishing.ts apps/api/src/integrations/social/pinterestPublisher.ts apps/api/src/services/socialAccountService.ts apps/api/src/controllers/socialAccountController.ts apps/api/src/routes/socialAccountRoutes.ts apps/api/tests/pinterestPublisher.test.ts apps/api/tests/pinterestSandboxEnvironment.test.ts
git commit -m "feat: support Pinterest Sandbox boards"
```

### Task 3: Add the Sandbox board helper to the composer

**Files:**
- Modify: `apps/web/lib/api.ts:211-229,350-355`
- Modify: `apps/web/components/composer/ComposerForm.tsx:1-170,506-570,691-699,983-991`
- Modify: `apps/web/components/composer/PinterestPinSettings.tsx:1-92`
- Modify: `apps/web/tests/pinterestComposer.test.ts`

**Interfaces:**
- Consumes `POST .../pinterest-boards` from Task 2 and `capabilities.pinterestApiEnvironment` stored by Task 1.
- Produces `PinterestPinSettings` props `accountEnvironmentById`, `creatingBoardAccountIds`, and `onCreateBoard`.
- Produces a Sandbox-only notice and a test-board form that selects the returned board automatically.

- [ ] **Step 1: Write failing composer contract tests**

Append to `apps/web/tests/pinterestComposer.test.ts`:

```ts
test("composer clearly marks Sandbox mode and can create a Sandbox test board", async () => {
  const settings = readFileSync(new URL("../components/composer/PinterestPinSettings.tsx", import.meta.url), "utf8");

  assert.match(settings, /Pinterest Sandbox test mode/);
  assert.match(settings, /Create Sandbox test board/);
  assert.match(composer, /method: "POST"/);
  assert.match(composer, /pinterest-boards/);
  assert.match(composer, /setPinterestBoardsByAccount/);
});
```

- [ ] **Step 2: Run the composer test and verify it fails before the UI is added**

Run:

```bash
cd apps/web
npx tsx --test tests/pinterestComposer.test.ts
```

Expected: failure because the Sandbox label and board-create path do not exist.

- [ ] **Step 3: Type the account environment and derive it in the composer**

In `apps/web/lib/api.ts`, replace `capabilities: unknown` with this narrow structural type:

```ts
capabilities: {
  oauth2?: boolean;
  scopes?: string[];
  pinterestApiEnvironment?: "production" | "sandbox";
};
```

In `ComposerForm.tsx`, derive `accountEnvironmentById` from `selectedPinterestAccounts`, defaulting a missing marker to `undefined`. Pass it to `PinterestPinSettings`; do not infer Sandbox from browser locale or from an account name.

- [ ] **Step 4: Implement board creation, state updates, and automatic selection**

Add `pinterestBoardCreatingAccountIds` state. Add this callback in `ComposerForm.tsx`:

```ts
async function createPinterestSandboxBoard(socialAccountId: string, name: string) {
  const board = await apiRequest<PinterestBoard>(
    `/workspaces/${workspaceId}/social-accounts/${socialAccountId}/pinterest-boards`,
    { method: "POST", token, body: { name } }
  );
  setPinterestBoardsByAccount((current) => ({
    ...current,
    [socialAccountId]: [...(current[socialAccountId] ?? []), board]
  }));
  updatePinterestPinSettings(socialAccountId, { boardId: board.id, boardName: board.name });
}
```

Wrap it so the calling UI always clears the per-account creating state and translates a rejected request into that account's existing error slot. Pass the wrapped callback and state to `PinterestPinSettings`.

- [ ] **Step 5: Render the Sandbox-only settings panel**

In `PinterestPinSettings.tsx`, add local `newBoardNameByAccount` state. For each account where `accountEnvironmentById[account.id] === "sandbox"`, show:

```tsx
<p className="sandbox-notice">
  {t("Pinterest Sandbox 测试模式：创建的内容仅用于测试，不代表公开生产 Pin。", "Pinterest Sandbox test mode: created content is for testing only and is not a public production Pin.")}
</p>
```

When that Sandbox account has a loaded empty board list, render an input (`maxLength={180}`) and a `type="button"` button labeled `Create Sandbox test board`. Disable the button if the trimmed name is empty or that account is creating. On success, clear only that account's input. Keep the existing production empty-state wording and never show the creation form for a production or environment-unmarked account.

- [ ] **Step 6: Run UI test, type check, and production build**

Run:

```bash
cd apps/web
npx tsx --test tests/pinterestComposer.test.ts
npm run lint
npm run build
```

Expected: the test finds the Sandbox label/create path, TypeScript passes, and Next.js builds successfully.

- [ ] **Step 7: Commit the composer flow**

```bash
git add apps/web/lib/api.ts apps/web/components/composer/ComposerForm.tsx apps/web/components/composer/PinterestPinSettings.tsx apps/web/tests/pinterestComposer.test.ts
git commit -m "feat: add Pinterest Sandbox composer flow"
```

### Task 4: Full verification, release documentation, and safe handoff

**Files:**
- Modify: no additional source files; preserve the release procedure in the pull-request/hand-off message.
- Test: `apps/api/tests/*.test.ts`
- Test: `apps/web/tests/*.test.ts`

**Interfaces:**
- Consumes the completed environment, API, and UI features from Tasks 1–3.
- Produces a verified release commit and exact user deployment/reconnect procedure.

- [ ] **Step 1: Run every API and web test**

Run:

```bash
cd apps/api
npx tsx --test tests/*.test.ts
cd ../web
npx tsx --test tests/*.test.ts
```

Expected: all API and web tests pass; no test should require a real Pinterest credential or network call.

- [ ] **Step 2: Run repository lint and build from the repository root**

Run:

```bash
cd ../..
npm run lint
npm run build
git status --short
```

Expected: lint/build succeed and `git status` lists only intentional changes plus the pre-existing `.handoff-*` untracked files, which must not be staged.

- [ ] **Step 3: Push and give the production activation sequence**

Run:

```bash
git push origin main
```

Tell the operator to add exactly `PINTEREST_API_ENV=sandbox` in `/opt/social-scheduler/.env`, then run:

```bash
cd /opt/social-scheduler
sudo bash scripts/deploy-server.sh
```

After deployment, disconnect the previously connected Pinterest account, reconnect it, create a Sandbox board from the English composer, publish one image Pin, and record the complete flow. Then change only `PINTEREST_API_ENV=production`, deploy again, and reconnect Pinterest before any real production Pin is published.
