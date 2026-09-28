import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("composer keeps the normal editor and offers an optional product template", async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;
  const { LanguageProvider } = await import("../components/LanguageProvider");
  const { ComposerForm } = await import("../components/composer/ComposerForm");
  const html = renderToStaticMarkup(
    React.createElement(LanguageProvider, null,
      React.createElement(ComposerForm, { token: "test", workspaces: [] })
    )
  );

  assert.match(html, /编辑帖子内容/);
  assert.match(html, /商品图文模板（可选）/);
  assert.match(html, /<details[^>]*>/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:=|>)/);
});
