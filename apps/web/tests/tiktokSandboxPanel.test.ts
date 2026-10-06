import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TikTokSandboxView, TikTokSandboxOutcome } from "../components/channels/TikTokSandboxPanel";
const props = { status: { eligible: true, connected: true }, busy: false, error: "", posts: [], selected: "", nextCursor: null,
  stats: null, metrics: null, onAction: () => {}, onSelect: () => {}, t: (_zh: string, en: string) => en };
test("ineligible user sees no sandbox controls", () => {
  assert.equal(renderToStaticMarkup(React.createElement(TikTokSandboxView, { ...props, status: { eligible: false, connected: false } })), "");
});
test("eligible user sees a read-only named sandbox and no publish controls", () => {
  const html = renderToStaticMarkup(React.createElement(TikTokSandboxView, props));
  assert.match(html, /TikTok Sandbox metrics test/); assert.match(html, /andypeng97/); assert.match(html, /Read-only/);
  assert.match(html, /Refresh account statistics/); assert.doesNotMatch(html, /<dt>|client_secret|Publish now/);
});
test("disconnected state offers test authorization but no enabled data actions", () => {
  const html = renderToStaticMarkup(React.createElement(TikTokSandboxView, { ...props, status: { eligible: true, connected: false } }));
  assert.match(html, /Connect sandbox/); assert.doesNotMatch(html, /Refresh account statistics/);
});
test("OAuth failure is visible independently of existing connection and never reflects query secrets", () => {
  const html = renderToStaticMarkup(React.createElement(TikTokSandboxOutcome, { search: "?tiktok_sandbox=failed&code=SECRET&state=SECRET", t: props.t }));
  assert.match(html, /role="alert"/); assert.match(html, /authorization failed/i); assert.doesNotMatch(html, /SECRET/);
});
test("OAuth outcome accepts only fixed values and distinguishes success", () => {
  const render = (search: string) => renderToStaticMarkup(React.createElement(TikTokSandboxOutcome, { search, t: props.t }));
  assert.match(render("?tiktok_sandbox=connected"), /role="status"/);
  assert.equal(render("?tiktok_sandbox=SECRET"), ""); assert.equal(render(""), "");
});
