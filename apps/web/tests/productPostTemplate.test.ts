import assert from "node:assert/strict";
import test from "node:test";
import { applyProductPostTemplate, buildProductPostTemplate, wouldOverwriteProductContent } from "../components/composer/productPostTemplate";

const existing = {
  baseText: "",
  baseWebsite: "",
  variantTexts: {
    instagram: "",
    facebook: "",
    youtube: "Keep YouTube copy",
    tiktok: "Keep TikTok copy",
    pinterest: "Keep Pinterest copy"
  },
  variantWebsites: {
    instagram: "",
    facebook: "",
    youtube: "https://example.com/video",
    tiktok: "",
    pinterest: ""
  },
  variantWebsiteModes: {
    instagram: "inherit" as const,
    facebook: "inherit" as const,
    youtube: "custom" as const,
    tiktok: "inherit" as const,
    pinterest: "inherit" as const
  }
};

const product = {
  name: "轻便通勤包",
  price: "$39.90",
  highlights: "轻量\n防泼水",
  productUrl: "https://shop.example.com/products/city-bag"
};

test("builds simple product copy without adding a fake Instagram shopping link", () => {
  const result = buildProductPostTemplate(product, "zh-CN");

  assert.equal(result.baseText, "轻便通勤包\n价格：$39.90\n• 轻量\n• 防泼水");
  assert.equal(result.instagramText, "轻便通勤包\n价格：$39.90\n• 轻量\n• 防泼水\n\n查看主页链接购买。");
  assert.equal(result.facebookText, "轻便通勤包\n价格：$39.90\n• 轻量\n• 防泼水\n\n点击下方商品链接查看详情。");
  assert.equal(result.productUrl, "https://shop.example.com/products/city-bag");
  assert.doesNotMatch(result.instagramText, /shop\.example\.com/);
});

test("uses English template labels in the English editor", () => {
  const result = buildProductPostTemplate(product, "en");

  assert.match(result.instagramText, /Price: \$39\.90/);
  assert.match(result.instagramText, /Visit the link in our profile to shop\./);
  assert.match(result.facebookText, /Open the product link below for details\./);
});

test("allows a product post without a store URL and omits the Facebook link prompt", () => {
  const template = buildProductPostTemplate({ ...product, productUrl: "  " }, "zh-CN");
  const result = applyProductPostTemplate(existing, template, ["facebook"]);

  assert.equal(template.productUrl, "");
  assert.equal(template.facebookText, template.baseText);
  assert.equal(result.variantWebsites.facebook, "");
  assert.equal(result.variantWebsiteModes.facebook, "none");
});

test("rejects missing product details, non-public admin URLs, and non-HTTPS links", () => {
  assert.throws(() => buildProductPostTemplate({ ...product, name: " " }, "zh-CN"));
  assert.throws(() => buildProductPostTemplate({ ...product, productUrl: "http://shop.example.com/products/bag" }, "zh-CN"));
  assert.throws(() => buildProductPostTemplate({ ...product, productUrl: "https://admin.shopify.com/store/shop/products/1" }, "zh-CN"));
});

test("applying the template changes only selected Instagram and Facebook variants", () => {
  const template = buildProductPostTemplate(product, "zh-CN");
  const result = applyProductPostTemplate(existing, template, ["instagram", "facebook"]);

  assert.equal(result.baseText, template.baseText);
  assert.equal(result.variantTexts.instagram, template.instagramText);
  assert.equal(result.variantTexts.facebook, template.facebookText);
  assert.equal(result.variantWebsiteModes.instagram, "none");
  assert.equal(result.variantWebsiteModes.facebook, "custom");
  assert.equal(result.variantWebsites.facebook, product.productUrl);
  assert.equal(result.variantTexts.youtube, "Keep YouTube copy");
  assert.equal(result.variantWebsites.youtube, "https://example.com/video");
  assert.equal(result.baseWebsite, "");
  assert.equal(existing.baseText, "");
  assert.equal(existing.variantTexts.instagram, "");
});

test("a Facebook-only template leaves Instagram content untouched", () => {
  const current = {
    ...existing,
    variantTexts: { ...existing.variantTexts, instagram: "Existing Instagram copy" }
  };
  const result = applyProductPostTemplate(current, buildProductPostTemplate(product, "zh-CN"), ["facebook"]);

  assert.equal(result.variantTexts.instagram, "Existing Instagram copy");
  assert.equal(result.variantWebsiteModes.instagram, "inherit");
  assert.equal(result.variantTexts.facebook.includes("轻便通勤包"), true);
});

test("template use is opt-in and prompts before replacing existing copy", () => {
  assert.equal(wouldOverwriteProductContent(existing, ["instagram", "facebook"]), false);
  assert.equal(wouldOverwriteProductContent({ ...existing, baseText: "A saved draft" }, ["facebook"]), true);
  assert.equal(wouldOverwriteProductContent({ ...existing, variantTexts: { ...existing.variantTexts, facebook: "Custom Facebook copy" } }, ["facebook"]), true);
  assert.equal(wouldOverwriteProductContent({ ...existing, baseWebsite: "https://shop.example.com/old" }, ["facebook"]), true);
  assert.equal(wouldOverwriteProductContent({ ...existing, baseWebsite: "https://shop.example.com/old" }, ["instagram"]), true);
  assert.throws(() => applyProductPostTemplate(existing, buildProductPostTemplate(product, "zh-CN"), ["youtube"]));
});
