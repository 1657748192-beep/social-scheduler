import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardOverviewView } from "../components/dashboard/DashboardActivity";
import { subscribeDashboardClock } from "../lib/dashboardClock";

test("greeting uses current device-local time, not the stale data fetch time", () => {
  const cases = [[0, "夜深了"], [4, "夜深了"], [5, "早上好"], [10, "早上好"], [11, "中午好"], [12, "中午好"], [13, "下午好"], [17, "下午好"], [18, "晚上好"], [23, "晚上好"]] as const;
  for (const [hour, expected] of cases) {
    const html = renderToStaticMarkup(React.createElement(DashboardOverviewView, {
      data: { publishedCount: 1, pendingCount: 0, draftCount: 0, connectedCount: 1, upcoming: [], fetchedAt: "2000-01-01T00:00:00Z" },
      loading: false, failed: false, locale: "zh-CN", timezone: "Pacific/Honolulu", userName: "Andy", now: new Date(2026, 9, 7, hour)
    } as any));
    assert.ok(html.includes(`${expected}，Andy!`), `${hour}: ${expected}`);
    assert.ok(html.includes("2026年10月7日星期三"));
    assert.ok(!html.includes("2000年"));
  }
});

test("live clock updates across midnight and stops updating after cleanup", context => {
  const start = new Date(2026, 9, 7, 23, 59);
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now: start.getTime() });
  const values: Date[] = [];
  const stop = subscribeDashboardClock(value => values.push(value));
  assert.equal(values.length, 1);
  context.mock.timers.tick(60000);
  assert.equal(values.at(-1)?.getDate(), 8);
  assert.equal(values.at(-1)?.getHours(), 0);
  stop();
  const count = values.length;
  context.mock.timers.tick(120000);
  assert.equal(values.length, count);
});

test("returning to the page updates its clock immediately and cleanup removes listeners", context => {
  context.mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date(2026, 9, 7, 10, 59).getTime() });
  const browserWindow = new EventTarget();
  const browserDocument = new EventTarget();
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", { configurable: true, value: browserWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, value: browserDocument });
  const values: Date[] = [];
  const stop = subscribeDashboardClock(value => values.push(value));
  try {
    context.mock.timers.setTime(new Date(2026, 9, 7, 11).getTime());
    browserWindow.dispatchEvent(new Event("focus"));
    assert.equal(values.at(-1)?.getHours(), 11);
    context.mock.timers.setTime(new Date(2026, 9, 8, 0).getTime());
    browserDocument.dispatchEvent(new Event("visibilitychange"));
    assert.equal(values.at(-1)?.getDate(), 8);
    stop();
    const count = values.length;
    browserWindow.dispatchEvent(new Event("focus"));
    browserDocument.dispatchEvent(new Event("visibilitychange"));
    assert.equal(values.length, count);
  } finally {
    stop();
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else delete (globalThis as any).window;
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument); else delete (globalThis as any).document;
  }
});
