"use client";

import * as React from "react";
import { useState } from "react";
import type { ComposerPlatform } from "../../lib/api";
import type { AppLocale } from "../LanguageProvider";
import { buildProductPostTemplate, type ProductPostTemplate } from "./productPostTemplate";

type ProductPostTemplatePickerProps = {
  locale: AppLocale;
  selectedPlatforms: ComposerPlatform[];
  onApply: (template: ProductPostTemplate) => void;
};

export function ProductPostTemplatePicker({ locale, selectedPlatforms, onApply }: ProductPostTemplatePickerProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [highlights, setHighlights] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canApply = selectedPlatforms.length > 0 && selectedPlatforms.every(
    (platform) => platform === "instagram" || platform === "facebook"
  );
  const t = (chinese: string, english: string) => locale === "en" ? english : chinese;

  function applyTemplate() {
    try {
      const template = buildProductPostTemplate({ name, price, highlights, productUrl }, locale);
      onApply(template);
      setError(null);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      setError(code === "product_name_required"
        ? t("请填写商品名称。", "Enter a product name.")
        : t("请填写公开的 HTTPS 商品页面链接，不要使用 Shopify 后台地址。", "Enter a public HTTPS product page URL, not a Shopify admin URL."));
    }
  }

  return (
    <details className="composer-panel product-template-picker">
      <summary>{t("商品图文模板（可选）", "Product post template (optional)")}</summary>
      <p className="muted">{t(
        "只在点击“套用模板”后填写文案；商品图片仍通过下方素材上传。不会自动发布或修改旧帖子。",
        "Copy is filled only after you apply the template. Upload the product image below. Existing posts are not changed."
      )}</p>
      <div className="product-template-fields">
        <label className="field">
          <span>{t("商品名称", "Product name")}</span>
          <input onChange={(event) => setName(event.target.value)} placeholder={t("例如：轻便通勤包", "For example: City bag")} value={name} />
        </label>
        <label className="field">
          <span>{t("价格（可选）", "Price (optional)")}</span>
          <input onChange={(event) => setPrice(event.target.value)} placeholder={t("例如：$39.90", "For example: $39.90")} value={price} />
        </label>
        <label className="field">
          <span>{t("商品卖点（可选，每行一条）", "Highlights (optional, one per line)")}</span>
          <textarea onChange={(event) => setHighlights(event.target.value)} placeholder={t("轻量\n防泼水", "Lightweight\nWater resistant")} value={highlights} />
        </label>
        <label className="field">
          <span>{t("公开商品链接（可选）", "Public product URL (optional)")}</span>
          <input inputMode="url" onChange={(event) => setProductUrl(event.target.value)} placeholder="https://shop.example.com/products/city-bag" type="text" value={productUrl} />
        </label>
      </div>
      <p className="muted">{t(
        "填写链接后，Facebook 文案会附上商品链接；Instagram 文案引导查看主页链接，请先在 Instagram 主页设置对应的购买地址。",
        "If provided, the product URL is included in Facebook copy. Instagram copy points to your profile link; set that destination in Instagram first."
      )}</p>
      {!canApply ? <p className="muted">{t("请只选择 Instagram 或 Facebook 账号后套用。", "Select only Instagram or Facebook accounts before applying.")}</p> : null}
      {error ? <p className="danger" role="alert">{error}</p> : null}
      <button className="button secondary" disabled={!canApply} onClick={applyTemplate} type="button">
        {t("套用模板", "Apply template")}
      </button>
    </details>
  );
}
