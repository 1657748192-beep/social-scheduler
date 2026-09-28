import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductPostTemplatePicker } from "../components/composer/ProductPostTemplatePicker";

test("product template is collapsed by default and never applies itself", () => {
  let applied = 0;
  const html = renderToStaticMarkup(createElement(ProductPostTemplatePicker, {
    locale: "zh-CN",
    selectedPlatforms: ["instagram", "facebook"],
    onApply: () => { applied += 1; }
  }));

  assert.match(html, /<details[^>]*>/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:=|>)/);
  assert.match(html, /商品图文模板（可选）/);
  assert.doesNotMatch(html, /\srequired(?:=|\s|>)/);
  assert.doesNotMatch(html, /<input[^>]*type="url"/);
  assert.equal(applied, 0);
});

test("template cannot be applied to an unrelated platform selection", () => {
  const html = renderToStaticMarkup(createElement(ProductPostTemplatePicker, {
    locale: "zh-CN",
    selectedPlatforms: ["youtube"],
    onApply: () => {}
  }));

  assert.match(html, /<button[^>]*disabled[^>]*>套用模板<\/button>/);
});
