import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AppShell } from "../components/AppShell";
import { LanguageProvider } from "../components/LanguageProvider";

test("sidebar keeps navigation without duplicate channel or account controls", () => {
  // tsx's classic JSX transform requires React in scope in imported client files.
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  const html = renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router },
    React.createElement(PathnameContext.Provider, { value: "/dashboard" },
      React.createElement(LanguageProvider, null,
        React.createElement(AppShell, { title: "控制台", children: React.createElement("p", null, "页面内容") })))));
  assert.doesNotMatch(html, /class="channel-progress"/);
  assert.doesNotMatch(html, /已连接平台数量|同一平台的账号数量不限/);
  const sidebar = html.match(/<aside[\s\S]*?<\/aside>/)![0];
  assert.doesNotMatch(sidebar, /连接通道|更多通道|退出登录|Signed in/);
  assert.match(sidebar, /帖子管理/);
  assert.match(sidebar, /排程日历/);
  assert.match(html, /页面内容/);
});

test("topbar has account dropdown beside composer instead of channel/calendar shortcuts", () => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  const html = renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router },
    React.createElement(PathnameContext.Provider, { value: "/dashboard" },
      React.createElement(LanguageProvider, null,
        React.createElement(AppShell, { title: "控制台", userLabel: "Andy peng", children: null })))));
  const header = html.match(/<header[\s\S]*?<\/header>/)![0];
  assert.doesNotMatch(header, /连接渠道|查看日历/);
  assert.match(header, /新建内容/);
  assert.match(header, /Andy peng/);
  assert.match(header, /aria-expanded="false"/);
  assert.match(header, /account-avatar[^>]*>A</);
  assert.doesNotMatch(header, /退出账号/);
});
