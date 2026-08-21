# Pinterest Image Pin Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a connected Pinterest account to create one image Pin immediately or at a scheduled time, with an account-specific board and title, the composer copy as the Pin description, and an optional website click-through link.

**Architecture:** Keep Pinterest-specific payload parsing and validation in a pure API module shared by the composer service and the Pinterest publisher. Add a Pinterest social publisher and a board-list endpoint behind the existing authenticated workspace routes. Extend the existing Composer Form pattern used for TikTok account settings, while keeping the shared scheduler, worker, media URLs, and retention lifecycle unchanged.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, BullMQ worker, Next.js/React, Pinterest API v5, Node `fetch`, Node built-in test runner with `tsx`.

**Spec:** docs/superpowers/specs/2026-08-21-pinterest-image-pin-publishing-design.md

## Global Constraints

- Implement only image Pins. Pinterest video Pins remain draft-only and must show an explicit unsupported message.
- A real Pinterest Pin requires exactly one ready image asset, a Pinterest board, and a title of 1–100 characters.
- Use the existing per-platform website setting as the Pinterest Pin `link`; do not append that URL to the Pinterest description or count it toward the description limit.
- Use the existing authenticated local-media URL resolution (`withResolvedMediaUrl(..., "publish")`) so Pinterest can fetch the original image from the server.
- Do not add Prisma schema or migration changes: `PostVariant.platformPayload`, `PublishJob`, `Schedule`, and `MediaAsset` already store the required data and lifecycle state.
- Preserve current media cleanup behavior. A future scheduled job is non-terminal, so its image remains available until publishing completes; after completion the existing 24-hour success and 72-hour failed retention applies.
- Keep user-facing Chinese and English text in the existing `useLanguage().t(zh, en)` style.
- Do not change OAuth credentials, secrets, `.env`, or the existing Pinterest redirect URI as part of this feature.

---

## File Map

| File | Responsibility |
| --- | --- |
| `apps/api/src/integrations/social/pinterestPublishing.ts` | Pure Pinterest settings parsing, image/title/link validation, request payload construction, and Pin permalink construction. |
| `apps/api/src/integrations/social/pinterestPublisher.ts` | Workspace account lookup, token/scope checks, board listing, Pinterest API requests, and real Pin creation. |
| `apps/api/src/integrations/social/registry.ts` | Register Pinterest as a real publisher. |
| `apps/api/src/services/socialAccountService.ts` | Authorize and expose board lookup for a workspace member. |
| `apps/api/src/controllers/socialAccountController.ts` | HTTP controller for Pinterest boards. |
| `apps/api/src/routes/socialAccountRoutes.ts` | Authenticated Pinterest board route. |
| `apps/api/src/services/composerService.ts` | Server-side validation of Pinterest publishing payload and selected media. |
| `apps/api/src/config/platformLimits.ts` | Align Pinterest description limit with the Pinterest API (800 characters). |
| `apps/api/tests/pinterestPublishing.test.ts` | Unit tests for pure Pinterest payload validation and construction. |
| `apps/api/tests/pinterestPublisher.test.ts` | Unit tests for Pinterest board pagination and API error normalization helpers. |
| `apps/web/lib/api.ts` | Pinterest board API response type. |
| `apps/web/components/composer/PinterestPinSettings.tsx` | Per-account board and title controls with loading/error states. |
| `apps/web/components/composer/ComposerForm.tsx` | Load boards, restore/save Pinterest settings, preflight checks, and route Pinterest through real publishing. |
| `apps/web/components/composer/PlatformEditor.tsx` | Make the Pinterest link wording accurately describe click-through behavior and preserve link mode controls. |
| `apps/web/components/composer/PostPreview.tsx` | Show Pinterest description and click-through destination without treating the link as caption text. |
| `apps/web/app/globals.css` | Styling for the Pinterest configuration cards and Pin preview metadata. |

## Task 1: Define a testable Pinterest Pin payload contract

**Files:**
- Create: `apps/api/src/integrations/social/pinterestPublishing.ts`
- Create: `apps/api/tests/pinterestPublishing.test.ts`
- Modify: `apps/api/src/config/platformLimits.ts`

- [ ] **Step 1: Write the failing pure-contract tests.**
  - Cover a complete payload, missing board, blank/over-100-character title, missing/non-image/multiple media, over-800-character description, invalid link, and a valid absent link.
  - Include one assertion that the generated Pinterest API body uses `{ source_type: "image_url", url, is_standard: true }`, stores `description` separately, and omits `link` when blank.
  - Run: `npx tsx --test apps/api/tests/pinterestPublishing.test.ts`
  - Expected: fail because the module does not exist.

- [ ] **Step 2: Implement the minimal pure helpers.**
  - Add `PinterestPinSettings`, `PinterestPinMedia`, `readPinterestPinSettings`, `getPinterestPinValidationError`, `buildPinterestCreatePinBody`, and `pinterestPinPermalink` exports.
  - Parse only `boardId`, optional `boardName`, `title`, and optional `link`; trim string values and treat blank values as absent.
  - Validate title 1–100, description at most 800, link as an absolute `http:` or `https:` URL at most 2048, and exactly one `image/*` media item with a nonblank public URL.
  - Use `https://www.pinterest.com/pin/${id}/` for successful Pin permalink construction.
  - Change the existing Pinterest composer limit to 800 in `platformLimits.ts`.

- [ ] **Step 3: Verify the contract.**
  - Run: `npx tsx --test apps/api/tests/pinterestPublishing.test.ts`
  - Run: `npm run lint -w apps/api`
  - Expected: all new tests pass and TypeScript reports no errors.

- [ ] **Step 4: Commit the contract.**
  - Run: `git add apps/api/src/integrations/social/pinterestPublishing.ts apps/api/src/config/platformLimits.ts apps/api/tests/pinterestPublishing.test.ts && git commit -m "feat: validate Pinterest image Pin payloads"`

## Task 2: Add a Pinterest API publisher and board discovery

**Files:**
- Create: `apps/api/src/integrations/social/pinterestPublisher.ts`
- Create: `apps/api/tests/pinterestPublisher.test.ts`
- Modify: `apps/api/src/integrations/social/registry.ts`

- [ ] **Step 1: Write failing publisher-helper tests.**
  - Test page aggregation from Pinterest `items` plus `bookmark` responses, stop when no bookmark remains, and expose a readable error when Pinterest returns a non-2xx JSON error.
  - Run: `npx tsx --test apps/api/tests/pinterestPublisher.test.ts`
  - Expected: fail because `PinterestPublisher` and its pure response helpers do not exist.

- [ ] **Step 2: Implement `PinterestPublisher`.**
  - Follow the account lookup pattern in `instagramPublisher.ts`: require an active `pinterest` social account in the requested workspace with an OAuth credential.
  - Require `boards:read` before board lookup and `pins:write` before publishing; return reconnect guidance if either scope is absent or the credential expiry is in the past.
  - Implement `listBoards(workspaceId, socialAccountId)` with `GET https://api.pinterest.com/v5/boards?page_size=100`, follow returned `bookmark` values, cap at 20 pages, and map each board to `{ id, name, description?, privacy? }`.
  - Implement `publish(input)` using the shared pure validation helpers, resolve exactly one image URL from `input.media`, then `POST https://api.pinterest.com/v5/pins` with `Authorization: Bearer <decrypted token>` and JSON body from `buildPinterestCreatePinBody`.
  - Return the provider `id`, `pinterestPinPermalink(id)`, and JSON response as `rawResponse`. Surface Pinterest API `code`/`message` to the scheduler error safely without including tokens.

- [ ] **Step 3: Register it as a supported real publisher.**
  - Import `PinterestPublisher` in `registry.ts`, add `"pinterest"` to `realPublishingPlatforms`, and instantiate it in `getSocialPublisher`.

- [ ] **Step 4: Verify publisher behavior.**
  - Run: `npx tsx --test apps/api/tests/pinterestPublisher.test.ts`
  - Run: `npm run lint -w apps/api`
  - Expected: helper tests and API type checking pass.

- [ ] **Step 5: Commit the publisher.**
  - Run: `git add apps/api/src/integrations/social/pinterestPublisher.ts apps/api/src/integrations/social/registry.ts apps/api/tests/pinterestPublisher.test.ts && git commit -m "feat: publish Pinterest image Pins"`

## Task 3: Expose authenticated board lookup to the composer

**Files:**
- Modify: `apps/api/src/services/socialAccountService.ts`
- Modify: `apps/api/src/controllers/socialAccountController.ts`
- Modify: `apps/api/src/routes/socialAccountRoutes.ts`

- [ ] **Step 1: Add a failing route-level test or focused source test.**
  - Add coverage that the board-list service requires workspace membership and delegates only the requested account to `PinterestPublisher.listBoards`.
  - Run: `npx tsx --test apps/api/tests/pinterestPublisher.test.ts`
  - Expected: fail until the service export and route are added.

- [ ] **Step 2: Add the service and controller.**
  - In `socialAccountService.ts`, implement `getPinterestBoards(userId, workspaceId, socialAccountId)`: call `requireWorkspaceMembership`, then `new PinterestPublisher().listBoards(workspaceId, socialAccountId)`.
  - In `socialAccountController.ts`, add `getPinterestBoardsController` using `req.user!.id`, `req.params.workspaceId`, and `req.params.socialAccountId`.

- [ ] **Step 3: Add the protected endpoint.**
  - In `socialAccountRoutes.ts`, register:
    `GET /workspaces/:workspaceId/social-accounts/:socialAccountId/pinterest-boards`
    behind `requireAuth` and `asyncHandler(getPinterestBoardsController)`.
  - Keep the existing TikTok endpoint unchanged.

- [ ] **Step 4: Verify endpoint compilation.**
  - Run: `npm run lint -w apps/api`
  - Expected: type checking passes and no route imports are unused.

- [ ] **Step 5: Commit the endpoint.**
  - Run: `git add apps/api/src/services/socialAccountService.ts apps/api/src/controllers/socialAccountController.ts apps/api/src/routes/socialAccountRoutes.ts apps/api/tests/pinterestPublisher.test.ts && git commit -m "feat: expose Pinterest boards to composer"`

## Task 4: Enforce Pinterest publishing requirements server-side

**Files:**
- Modify: `apps/api/src/services/composerService.ts`
- Modify: `apps/api/tests/pinterestPublishing.test.ts`

- [ ] **Step 1: Extend tests for server preflight input.**
  - Add cases showing that a Pinterest draft may be incomplete, while immediate/scheduled Pinterest publishing rejects missing board/title, a non-image asset, multiple assets, and an invalid link payload.
  - Run: `npx tsx --test apps/api/tests/pinterestPublishing.test.ts`
  - Expected: fail until composer service uses Pinterest validation.

- [ ] **Step 2: Preserve media metadata for validation.**
  - Replace `assertMediaBelongsToWorkspace` with `getReadyWorkspaceMediaById`, which queries the same workspace-ready assets but selects `id`, `mimeType`, and `fileUrl`, verifies all requested IDs exist, and returns a map keyed by asset ID.
  - Keep account validation in parallel with this lookup.

- [ ] **Step 3: Validate non-draft Pinterest variants.**
  - Add `assertPinterestPublishSettings(variants, mediaById)` beside `assertTikTokPublishSettings`.
  - For each Pinterest variant, call the shared `getPinterestPinValidationError` using the variant payload and its resolved selected assets; throw `HttpError(400, ...)` with the exact field-level reason.
  - Call it only for `input.scheduledAt || input.publishNow`, so users can save incomplete work as a draft.

- [ ] **Step 4: Verify server invariants.**
  - Run: `npx tsx --test apps/api/tests/pinterestPublishing.test.ts`
  - Run: `npm run lint -w apps/api`
  - Expected: drafts remain allowed; real publish requests are rejected before a job is queued when invalid.

- [ ] **Step 5: Commit server validation.**
  - Run: `git add apps/api/src/services/composerService.ts apps/api/tests/pinterestPublishing.test.ts && git commit -m "feat: validate Pinterest publish requests"`

## Task 5: Add Pinterest board/title controls to the content editor

**Files:**
- Create: `apps/web/components/composer/PinterestPinSettings.tsx`
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/components/composer/ComposerForm.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add the frontend response/settings types.**
  - In `apps/web/lib/api.ts`, add `PinterestBoard` with `id`, `name`, optional `description`, and optional `privacy`.
  - In `ComposerForm.tsx`, add local `PinterestPinSettingsValue` plus helpers that create/read `{ boardId, boardName, title, link? }` without copying arbitrary JSON fields.

- [ ] **Step 2: Build the Pinterest settings component.**
  - Render one card per selected Pinterest account with the account name, loading indicator, load error, required board `<select>`, required title `<input maxLength={100}>`, and bilingual guidance that the platform website field is the Pin click-through destination.
  - Use supplied props equivalent to the TikTok component: accounts, boards-by-account, loading IDs, errors-by-account, settings-by-account, and `onChange`.
  - Do not offer video controls, privacy controls, or a publish toggle for Pinterest.

- [ ] **Step 3: Load boards safely when selection/workspace changes.**
  - Add selected Pinterest account memoized IDs and state maps alongside the existing TikTok state.
  - On workspace reset, clear all Pinterest state.
  - On selected Pinterest account changes, request the new authenticated boards endpoint for each account; initialize a fresh settings record only when no restored record already exists; retain cancellation protection used by the TikTok loading effect.

- [ ] **Step 4: Restore and persist settings correctly.**
  - When copying a post or opening a draft, restore Pinterest `platformPayload` per social-account ID.
  - During save, use unmodified `baseText` as `baseText`; for non-Pinterest variants keep `appendWebsiteToText(...)` exactly as today.
  - For Pinterest variants, send the raw platform text as `description` and store `{ boardId, boardName, title, link: resolvedWebsitesByPlatform.pinterest || undefined }` in `platformPayload`.
  - Add `pinterest` to `realPublishingPlatforms` so immediate/scheduled Pinterest no longer displays the draft-only notice.

- [ ] **Step 5: Add client-side preflight checks and checklist.**
  - For non-draft Pinterest selections require exactly one image, no video, a loaded board list with a selected board, a title, and a valid selected platform link if present.
  - Add a Pinterest Pin setup row to `publishChecks` and block submission with an account-specific bilingual message when incomplete.

- [ ] **Step 6: Verify web compilation and type safety.**
  - Run: `npm run lint -w apps/web`
  - Run: `npm run build -w apps/web`
  - Expected: web type checking and Next build pass.

- [ ] **Step 7: Commit the composer controls.**
  - Run: `git add apps/web/lib/api.ts apps/web/components/composer/PinterestPinSettings.tsx apps/web/components/composer/ComposerForm.tsx apps/web/app/globals.css && git commit -m "feat: configure Pinterest image Pins in composer"`

## Task 6: Correct website-link and Pin-preview behavior

**Files:**
- Modify: `apps/web/components/composer/PlatformEditor.tsx`
- Modify: `apps/web/components/composer/PostPreview.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add a focused UI behavior test or pure preview helper test.**
  - Add a testable helper or component-level assertion that Pinterest preview description remains unchanged when a website link exists, while non-Pinterest platform preview keeps appending its URL as before.
  - Run: `npx tsx --test apps/api/tests/pinterestPublishing.test.ts`
  - Expected: fail until the Pinterest-specific display rule exists.

- [ ] **Step 2: Make PlatformEditor copy platform-aware.**
  - Keep the existing inherit/custom/no-link controls.
  - For Pinterest, change the explanatory text from “append to copy” to “opens when a viewer clicks the Pin”; do not include its link in character counting.
  - Keep existing behavior unchanged for every other platform.

- [ ] **Step 3: Render a useful Pinterest preview.**
  - In `PostPreview.tsx`, do not call `appendWebsiteToText` when previewing Pinterest.
  - Add a compact Pin destination row when a Pinterest link is present, show the required Pin title from the selected account’s settings where available, and preserve the current media preview/fallback behavior.

- [ ] **Step 4: Verify preview behavior and the web build.**
  - Run: `npm run lint -w apps/web`
  - Run: `npm run build -w apps/web`
  - Expected: the Pinterest link is visible as a destination but does not become caption text; other previews are unchanged.

- [ ] **Step 5: Commit preview behavior.**
  - Run: `git add apps/web/components/composer/PlatformEditor.tsx apps/web/components/composer/PostPreview.tsx apps/web/app/globals.css apps/api/tests/pinterestPublishing.test.ts && git commit -m "feat: preview Pinterest Pin destinations"`

## Task 7: Verify lifecycle, end-to-end workflow, and deployment readiness

**Files:**
- Modify only if a verification exposes a defect: `apps/api/src/services/mediaStorageService.ts`, relevant API/web files, and their tests.

- [ ] **Step 1: Add a cleanup regression test.**
  - Extract a small pure terminal-media eligibility helper from `cleanupExpiredMedia` only if needed for testability.
  - Verify a media asset attached to a future queued Pinterest schedule is not eligible for cleanup; verify a published asset becomes eligible only after the existing 24-hour success window and a failed asset only after the 72-hour failed window.
  - Run: `npx tsx --test apps/api/tests/pinterestPublishing.test.ts apps/api/tests/sessionLifetime.test.ts`

- [ ] **Step 2: Run the full local verification set.**
  - Run: `npx tsx --test apps/api/tests/*.test.ts`
  - Run: `npm run lint`
  - Run: `npm run build`
  - Expected: all tests, API type checking, web type checking, and production builds pass.

- [ ] **Step 3: Perform manual local acceptance checks.**
  - Connect or use one existing Pinterest account, open Content editor, choose the account, confirm its boards load, choose a board, enter title/copy/one JPEG or PNG and optional website link, and inspect the preview.
  - Save a draft with incomplete Pinterest settings and confirm it saves.
  - Attempt immediate publish with missing board/title and confirm it is blocked locally; then publish a complete Pin and confirm the returned Pinterest link appears in calendar/post management.
  - Schedule a Pin for the future and confirm its asset remains reusable; after a terminal result, confirm existing retention labels/countdowns remain accurate.

- [ ] **Step 4: Commit any verification-only fixes.**
  - Run: `git status --short`, add only files related to this feature, then `git commit -m "test: verify Pinterest publishing lifecycle"` if changes were required.

- [ ] **Step 5: Prepare release handoff.**
  - Run: `git status --short` and confirm unrelated untracked handoff files remain unstaged.
  - Run: `git log --oneline -7` and capture the Pinterest feature commits.
  - After the user pushes GitHub, deploy with:
    ```bash
    cd /opt/social-scheduler
    sudo bash scripts/deploy-server.sh
    ```
  - Confirm the deploy output contains `Media storage: local`, API health JSON with `"ok":true`, and no Pinterest configuration error.

## Plan Review

- [ ] Scope review: Image Pin only, no Pinterest video publishing, and no new database schema are included.
- [ ] Data review: board/title/link are account-specific `platformPayload`; description is platform copy; original media lifecycle remains existing server-local retention.
- [ ] API review: Pinterest board discovery and Pin creation use OAuth scopes already requested by the existing provider config.
- [ ] UX review: immediate and scheduled publishing use the same configuration; drafts allow incomplete values; Pinterest link is click-through, not caption text.
- [ ] Safety review: no secrets in code, logs, tests, commits, or user-visible messages.
