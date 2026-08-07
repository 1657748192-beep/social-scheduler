# Public and Legal Bilingual Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stable Chinese and English public, privacy-policy, and terms-of-service routes for Social Scheduler.

**Architecture:** Use dedicated App Router routes so English works in a fresh browser without local storage. Extract the shared public header, footer, and route mapping; keep legal content per-language and server rendered.

**Tech Stack:** Next.js App Router, React, TypeScript, Node built-in test runner, existing CSS.

## Global Constraints

- Chinese remains at `/`, `/privacy`, and `/terms`.
- English is directly available at `/en`, `/en/privacy`, and `/en/terms`.
- The public-language toggle uses routes and does not change authenticated-app locale.
- `/privacy-policy` remains the Chinese privacy alias.
- Do not add messaging or comment-management claims to legal copy.

### Task 1: Shared public chrome

**Files:** Create `apps/web/components/public/PublicSiteChrome.tsx` and `apps/web/tests/publicRouteChrome.test.ts`; modify `apps/web/app/globals.css`.

**Interfaces:** Export `PublicLocale = "zh-CN" | "en"`, `publicPaths`, `PublicHeader`, and `PublicFooter`.

- [ ] Write a failing `publicRouteChrome.test.ts` that reads `PublicSiteChrome.tsx` and asserts Chinese paths are `/`, `/privacy`, `/terms`; English paths are `/en`, `/en/privacy`, `/en/terms`; and both `中文` and `English` labels exist.
- [ ] Run `npx.cmd tsx --test tests/publicRouteChrome.test.ts` inside `apps/web`; verify failure because the source file is missing.
- [ ] Implement typed `publicPaths` and server-rendered header/footer. They must use only mapped paths, show an explicit language selector, keep legal links in the current language, and reuse current public CSS classes.
- [ ] Add small responsive styles for the public language links.
- [ ] Re-run the test; expect pass.
- [ ] Commit only the three Task 1 files with message `feat: add bilingual public page chrome`.

### Task 2: Chinese and English public home

**Files:** Create `apps/web/components/public/PublicHomeContent.tsx`, `apps/web/app/en/page.tsx`, and `apps/web/tests/publicHomeLanguageRoutes.test.ts`; modify `apps/web/app/page.tsx`.

**Interfaces:** `PublicHomeContent({ locale }: { locale: PublicLocale })` renders all home sections. Root supplies `locale="zh-CN"`; `/en` supplies `locale="en"`.

- [ ] Write a failing test that asserts `app/en/page.tsx` passes `locale="en"`, and `PublicHomeContent.tsx` includes `Social Scheduler` and `outside Mainland China`.
- [ ] Run `npx.cmd tsx --test tests/publicHomeLanguageRoutes.test.ts` inside `apps/web`; verify it fails because the new route does not exist.
- [ ] Move existing English home copy into `PublicHomeContent`; add complete Chinese translations for brand, navigation, calls to action, features, workflow, platform list, and OAuth/password note.
- [ ] Compose `/` and `/en` from shared header, home content, and footer. Add English metadata on `/en`.
- [ ] Re-run the test; expect pass.
- [ ] Commit Task 2 files with message `feat: add Chinese and English public home routes`.

### Task 3: English privacy policy

**Files:** Create `apps/web/app/en/privacy/page.tsx` and `apps/web/tests/privacyEnglishPolicy.test.ts`; modify `apps/web/app/privacy/page.tsx`.

**Interfaces:** Both language routes use shared public chrome. English policy must include Facebook, Instagram, YouTube, TikTok, LinkedIn, Pinterest, X, `user.info.basic`, `video.publish`, data retention, revocation/deletion, no sale/targeted ads, support email, and `outside Mainland China`.

- [ ] Write a failing source test that reads `app/en/privacy/page.tsx` and asserts each platform name, the two TikTok scopes, `72 hours`, `not sell`, and `outside Mainland China`.
- [ ] Run `npx.cmd tsx --test tests/privacyEnglishPolicy.test.ts` inside `apps/web`; verify failure because `/en/privacy` is missing.
- [ ] Translate every current privacy commitment without changing retention or deletion rules. Add English metadata and header/footer. Leave `/privacy-policy` untouched as the Chinese alias.
- [ ] Re-run `npx.cmd tsx --test tests/privacyEnglishPolicy.test.ts tests/privacyPlatformDisclosure.test.ts`; expect pass.
- [ ] Commit Task 3 files with message `feat: add English privacy policy`.

### Task 4: English terms of service

**Files:** Create `apps/web/app/en/terms/page.tsx` and `apps/web/tests/termsEnglishPolicy.test.ts`; modify `apps/web/app/terms/page.tsx`.

**Interfaces:** Both terms routes use shared public chrome. English terms cover authorized accounts, rights to content, music/copyright responsibility, third-party platform/API restrictions, account restriction/deletion, disclaimer, contact, and `outside Mainland China`.

- [ ] Write a failing source test that asserts English terms include `own or have the necessary rights`, `music`, `third-party platform`, `outside Mainland China`, and `1657748192@qq.com`.
- [ ] Run `npx.cmd tsx --test tests/termsEnglishPolicy.test.ts` inside `apps/web`; verify failure because `/en/terms` is missing.
- [ ] Translate every current terms commitment, add English metadata and public chrome, and ensure English legal links stay under `/en/*`.
- [ ] Re-run the test; expect pass.
- [ ] Commit Task 4 files with message `feat: add English terms page`.

### Task 5: Complete verification

**Files:** Modify the four new route tests from Tasks 1-4.

- [ ] Add final assertions that English chrome links to `/en/privacy` and `/en/terms`, and Chinese chrome links to `/privacy` and `/terms`.
- [ ] Run all focused tests from `apps/web`: `npx.cmd tsx --test tests/publicRouteChrome.test.ts tests/publicHomeLanguageRoutes.test.ts tests/privacyEnglishPolicy.test.ts tests/termsEnglishPolicy.test.ts tests/privacyPlatformDisclosure.test.ts`.
- [ ] Run `npm.cmd run lint --workspace @social-scheduler/web` and `npm.cmd run build --workspace @social-scheduler/web` from the repository root.
- [ ] Commit remaining public-page changes with message `test: verify bilingual public legal routes`.

## Plan self-review

- Route stability and Chinese defaults are covered by Tasks 1-2.
- Complete English legal content is covered by Tasks 3-4.
- Tests, lint, and build verification are covered by Task 5.
- All interfaces, filenames, commands, and required language content are explicit.
