# Global Status Label Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every shared, user-visible application status label display in English when the active language is English, while preserving Chinese as the default.

**Architecture:** Centralize Chinese and English values in `apps/web/lib/labels.ts` and add an optional locale argument to its shared status helpers. Components read the active locale from `LanguageProvider` and pass it to shared label functions; page-specific publishing-access states use the existing `t(chinese, english)` helper.

**Tech Stack:** Next.js 15, React 19, TypeScript, Node test runner with `tsx`.

## Global Constraints

- Keep `zh-CN` as the default locale for existing callers.
- Preserve unknown raw backend status values as the fallback display value.
- Translate only application-owned user-interface labels; do not translate third-party API errors or user-authored content.
- Do not add new dependencies.

---

### Task 1: Add locale-aware shared status helpers

**Files:**
- Modify: `apps/web/lib/labels.ts`
- Create: `apps/web/tests/statusLabelLocalization.test.ts`

**Interfaces:**
- Consumes: locale string `"zh-CN" | "en"`.
- Produces: `roleLabel`, `accountStatusLabel`, `memberStatusLabel`, `invitationStatusLabel`, `scheduleStatusLabel`, and `publishJobStatusLabel` with signature `(status: string, locale?: "zh-CN" | "en") => string`.

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { publishJobStatusLabel, scheduleStatusLabel } from "../lib/labels";

test("shared schedule and job statuses use English labels in English mode", () => {
  assert.equal(scheduleStatusLabel("published", "en"), "Published");
  assert.equal(publishJobStatusLabel("succeeded", "en"), "Succeeded");
});
```

Add assertions for all supported account, member, invitation, schedule, and publish-job values, plus an unknown value fallback.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd tsx --test apps/web/tests/statusLabelLocalization.test.ts`

Expected: FAIL because the current helpers ignore a locale argument and return Chinese labels.

- [ ] **Step 3: Write minimal implementation**

```ts
export type LabelLocale = "zh-CN" | "en";

function localizedLabel(status: string, labels: Record<string, [string, string]>, locale: LabelLocale = "zh-CN") {
  const label = labels[status];
  return label ? label[locale === "en" ? 1 : 0] : status;
}

export function scheduleStatusLabel(status: string, locale: LabelLocale = "zh-CN") {
  return localizedLabel(status, {
    published: ["已发布", "Published"]
  }, locale);
}
```

Use this pattern for every existing shared label helper and retain all existing Chinese values.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd tsx --test apps/web/tests/statusLabelLocalization.test.ts`

Expected: PASS with Chinese defaults and English labels for all tested statuses.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/labels.ts apps/web/tests/statusLabelLocalization.test.ts
git commit -m "feat: localize shared status labels"
```

### Task 2: Pass active locale to shared status consumers

**Files:**
- Modify: `apps/web/components/calendar/ScheduleDetailPanel.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`
- Modify: `apps/web/app/invitations/[token]/page.tsx`

**Interfaces:**
- Consumes: locale-aware shared helper signatures from Task 1 and `locale` from `useLanguage()`.
- Produces: English schedule/publishing task labels in the calendar panel and English account/member/invitation labels where those pages are in English mode.

- [ ] **Step 1: Write the failing source-level regression test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("calendar detail passes the active locale to publish status labels", () => {
  const source = readFileSync("components/calendar/ScheduleDetailPanel.tsx", "utf8");
  assert.match(source, /scheduleStatusLabel\(schedule\.status, locale\)/);
  assert.match(source, /publishJobStatusLabel\(latestJob\.status, locale\)/);
});
```

Extend the same test to assert dashboard and invitation status calls pass `locale`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd tsx --test apps/web/tests/statusLabelLocalization.test.ts`

Expected: FAIL because existing consumers call the helpers without a locale.

- [ ] **Step 3: Write minimal implementation**

```tsx
const { locale, t } = useLanguage();

<dd>{scheduleStatusLabel(schedule.status, locale)}</dd>
{publishJobStatusLabel(latestJob.status, locale)}
```

Add `locale` to existing `useLanguage()` destructuring and pass it to every shared label invocation in the listed files. Do not alter API payloads or status values.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd tsx --test apps/web/tests/statusLabelLocalization.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/calendar/ScheduleDetailPanel.tsx apps/web/app/dashboard/page.tsx apps/web/app/invitations/[token]/page.tsx apps/web/tests/statusLabelLocalization.test.ts
git commit -m "fix: render shared statuses in active language"
```

### Task 3: Localize page-specific publishing access statuses

**Files:**
- Modify: `apps/web/app/dashboard/page.tsx`
- Modify: `apps/web/app/admin/page.tsx`
- Modify: `apps/web/tests/statusLabelLocalization.test.ts`

**Interfaces:**
- Consumes: `t(chinese, english)` and active locale from `LanguageProvider`.
- Produces: English `Active`, `Disabled`, and `Expired` publishing-access statuses in the dashboard and administrator UI.

- [ ] **Step 1: Write the failing source-level regression test**

```ts
test("publishing access status helpers provide English values", () => {
  const dashboard = readFileSync("app/dashboard/page.tsx", "utf8");
  const admin = readFileSync("app/admin/page.tsx", "utf8");
  assert.match(dashboard, /t\("发布权限已停用", "Publishing access disabled"\)/);
  assert.match(admin, /useLanguage\(\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd tsx --test apps/web/tests/statusLabelLocalization.test.ts`

Expected: FAIL because both pages currently return Chinese-only publishing-access labels.

- [ ] **Step 3: Write minimal implementation**

```tsx
const { t } = useLanguage();

function accessStatusLabel(status: "active" | "disabled" | "expired", t: Translate) {
  if (status === "expired") return t("测试已到期", "Expired");
  if (status === "disabled") return t("已停用", "Disabled");
  return t("使用中", "Active");
}
```

Define a narrow local `Translate` type if needed, pass `t` from the component call site, and leave date display behavior unchanged.

- [ ] **Step 4: Run targeted and project checks**

Run: `npx.cmd tsx --test apps/web/tests/statusLabelLocalization.test.ts && npm.cmd run lint && npm.cmd run build`

Expected: all tests, TypeScript checks, and production build pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/page.tsx apps/web/app/admin/page.tsx apps/web/tests/statusLabelLocalization.test.ts
git commit -m "fix: localize publishing access statuses"
```
