import type { ComposerPlatform } from "../../lib/api";
import type { AppLocale } from "../LanguageProvider";
import type { WebsiteMode } from "./PlatformEditor";

export type ProductPostTemplateInput = {
  name: string;
  price: string;
  highlights: string;
  productUrl: string;
};

export type ProductPostTemplate = {
  baseText: string;
  instagramText: string;
  facebookText: string;
  productUrl: string;
};

export type ProductPostContent = {
  baseText: string;
  baseWebsite: string;
  variantTexts: Record<ComposerPlatform, string>;
  variantWebsites: Record<ComposerPlatform, string>;
  variantWebsiteModes: Record<ComposerPlatform, WebsiteMode>;
};

export function buildProductPostTemplate(input: ProductPostTemplateInput, locale: AppLocale): ProductPostTemplate {
  const name = input.name.trim().replace(/\s+/g, " ");
  const price = input.price.trim();
  const highlights = input.highlights.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const productUrl = input.productUrl.trim();

  if (!name) throw new Error("product_name_required");

  if (productUrl) {
    let url: URL;
    try {
      url = new URL(productUrl);
    } catch {
      throw new Error("public_product_url_required");
    }
    if (url.protocol !== "https:" || url.hostname === "admin.shopify.com" || url.pathname.startsWith("/admin")) {
      throw new Error("public_product_url_required");
    }
  }

  const baseText = [
    name,
    price ? `${locale === "en" ? "Price: " : "价格："}${price}` : "",
    ...highlights.map((highlight) => `• ${highlight}`)
  ].filter(Boolean).join("\n");

  return {
    baseText,
    instagramText: `${baseText}\n\n${locale === "en" ? "Visit the link in our profile to shop." : "查看主页链接购买。"}`,
    facebookText: productUrl ? `${baseText}\n\n${locale === "en" ? "Open the product link below for details." : "点击下方商品链接查看详情。"}` : baseText,
    productUrl
  };
}

export function applyProductPostTemplate(
  current: ProductPostContent,
  template: ProductPostTemplate,
  selectedPlatforms: ComposerPlatform[]
): ProductPostContent {
  if (!selectedPlatforms.length || selectedPlatforms.some((platform) => platform !== "instagram" && platform !== "facebook")) {
    throw new Error("instagram_or_facebook_only");
  }

  const next: ProductPostContent = {
    baseText: template.baseText,
    baseWebsite: current.baseWebsite,
    variantTexts: { ...current.variantTexts },
    variantWebsites: { ...current.variantWebsites },
    variantWebsiteModes: { ...current.variantWebsiteModes }
  };

  if (selectedPlatforms.includes("instagram")) {
    next.variantTexts.instagram = template.instagramText;
    next.variantWebsites.instagram = "";
    next.variantWebsiteModes.instagram = "none";
  }
  if (selectedPlatforms.includes("facebook")) {
    next.variantTexts.facebook = template.facebookText;
    next.variantWebsites.facebook = template.productUrl;
    next.variantWebsiteModes.facebook = template.productUrl ? "custom" : "none";
  }

  return next;
}

export function wouldOverwriteProductContent(current: ProductPostContent, selectedPlatforms: ComposerPlatform[]) {
  return Boolean(
    current.baseText.trim() ||
    selectedPlatforms.some((platform) =>
      current.variantTexts[platform].trim() ||
      current.variantWebsites[platform].trim() ||
      (current.variantWebsiteModes[platform] === "inherit" && current.baseWebsite.trim())
    )
  );
}
