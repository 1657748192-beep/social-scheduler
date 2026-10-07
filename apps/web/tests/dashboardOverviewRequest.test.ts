import assert from "node:assert/strict";
import test from "node:test";
import { startDashboardOverviewRequest } from "../lib/dashboardOverviewRequest";

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
