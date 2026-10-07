import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import SocialAccountsPage from "../app/social-accounts/page";
import DashboardPage from "../app/dashboard/page";
import { LanguageProvider } from "../components/LanguageProvider";

function renderPage(component: React.ComponentType, pathname: string) {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router },
    React.createElement(PathnameContext.Provider, { value: pathname },
      React.createElement(LanguageProvider, null, React.createElement(component)))));
}

test("social accounts route focuses on workspace account management, not activity or team management", () => {
  const html = renderPage(SocialAccountsPage, "/social-accounts");
  assert.match(html, /<h1>社交账号<\/h1>/);
  assert.match(html, /当前工作区/);
  assert.match(html, /连接与授权状态/);
  assert.match(html, /只有所有者和管理员可以绑定社交账号/);
  assert.doesNotMatch(html, /内容统计|待处理邀请|新工作区名称/);
  assert.match(html, /class="active" href="\/social-accounts"/);
});

test("dashboard retains activity, channel management and workspace administration", () => {
  const html = renderPage(DashboardPage, "/dashboard");
  assert.match(html, /<h1>控制台<\/h1>/);
  assert.match(html, /内容统计/);
  assert.match(html, /连接与授权状态/);
  assert.match(html, /待处理邀请|新工作区名称/);
});
