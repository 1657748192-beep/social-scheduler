import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AppShell } from "../components/AppShell";
import { LanguageProvider } from "../components/LanguageProvider";

test("sidebar retains channel management and sign-out without the platform progress card", () => {
  // tsx's classic JSX transform requires React in scope in imported client files.
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  const html = renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router },
    React.createElement(PathnameContext.Provider, { value: "/dashboard" },
      React.createElement(LanguageProvider, null,
        React.createElement(AppShell, { title: "控制台", children: React.createElement("p", null, "页面内容") })))));
  assert.doesNotMatch(html, /class="channel-progress"/);
  assert.doesNotMatch(html, /已连接平台数量|同一平台的账号数量不限/);
  assert.match(html, /更多通道/);
  assert.match(html, /连接通道/);
  assert.match(html, /退出登录/);
  assert.match(html, /页面内容/);
});
