import assert from "node:assert/strict";
import test from "node:test";
import { startDashboardOverviewRequest } from "../lib/dashboardOverviewRequest";
import * as resourceRequests from "../lib/dashboardOverviewRequest";

test("content resource refresh uses its own authenticated endpoint and ignores canceled responses", async () => {
  const start = (resourceRequests as any).startDashboardResourceRequest;
  assert.equal(typeof start, "function");
  const originalFetch = globalThis.fetch;
  let resolveResponse: (value: Response) => void = () => {};
  const received: unknown[] = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith("/workspaces/w/composer/drafts"));
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer fixture");
    return new Promise(resolve => { resolveResponse = resolve; });
  };
  try {
    const stop = start("fixture", "/workspaces/w/composer/drafts", (data: unknown) => received.push(data), false);
    stop();
    resolveResponse(Response.json([]));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(received, []);
  } finally { globalThis.fetch = originalFetch; }
});

test("automatic overview refresh pauses when hidden, resumes on return and cleans up", async context => {
  context.mock.timers.enable({ apis: ["setInterval"] });
  const originalFetch = globalThis.fetch;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const browser = new EventTarget();
  Object.defineProperty(globalThis, "document", { configurable: true, value: page });
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  let calls = 0;
  const received: unknown[] = [];
  globalThis.fetch = async () => { calls++; return Response.json({ publishedCount: calls }); };
  const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
  const stop = startDashboardOverviewRequest("fixture", "w", data => received.push(data), true);
  try {
    await flush();
    assert.equal(calls, 1);
    context.mock.timers.tick(60000);
    await flush();
    assert.deepEqual(received, [{ publishedCount: 1 }, { publishedCount: 2 }]);
    page.visibilityState = "hidden";
    context.mock.timers.tick(120000);
    browser.dispatchEvent(new Event("focus"));
    assert.equal(calls, 2);
    const stopSingle = startDashboardOverviewRequest("fixture", "w", () => {});
    await flush();
    assert.equal(calls, 3);
    stopSingle();
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    browser.dispatchEvent(new Event("focus"));
    await flush();
    assert.equal(calls, 4);
    stop();
    context.mock.timers.tick(60000);
    browser.dispatchEvent(new Event("focus"));
    assert.equal(calls, 4);
  } finally {
    stop(); globalThis.fetch = originalFetch;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else delete (globalThis as any).document;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else delete (globalThis as any).window;
  }
});

test("late workspace responses and cleanup do not replace the current overview", async () => {
  const original = globalThis.fetch;
  const responses: Array<(response: Response) => void> = [];
  const results: unknown[] = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith("/dashboard-overview"));
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer fixture");
    return new Promise(resolve => responses.push(resolve));
  };
  try {
    const stopA = startDashboardOverviewRequest("fixture", "A", data => results.push(data));
    stopA();
    const stopB = startDashboardOverviewRequest("fixture", "B", data => results.push(data));
    assert.equal(responses.length, 2);
    responses[1](Response.json({ publishedCount: 7 }));
    await new Promise(resolve => setTimeout(resolve, 0));
    responses[0](Response.json({ publishedCount: 99 }));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(results, [{ publishedCount: 7 }]);
    stopB();
  } finally { globalThis.fetch = original; }
});

test("failed reads remain unavailable and a subsequent refresh can return genuine zeros", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const results: unknown[] = [];
  globalThis.fetch = async () => ++calls === 1 ? new Response("{}", { status: 503 }) : Response.json({ publishedCount: 0 });
  try {
    startDashboardOverviewRequest("fixture", "w", data => results.push(data));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(results, [null]);
    startDashboardOverviewRequest("fixture", "w", data => results.push(data));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(results, [null, { publishedCount: 0 }]);
  } finally { globalThis.fetch = original; }
});
