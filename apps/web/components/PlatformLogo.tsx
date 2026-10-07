import React from "react";
import { platformLabel } from "../lib/labels";

const officialLogos: Record<string, string> = {
  instagram: "/platform-logos/instagram.png",
  facebook: "/platform-logos/facebook.png",
  youtube: "/platform-logos/youtube.png",
  tiktok: "/platform-logos/tiktok.png",
  pinterest: "/platform-logos/pinterest.svg"
};

export function PlatformLogo({ platform, className = "" }: { platform: string; className?: string }) {
  const src = officialLogos[platform];
  const label = platformLabel(platform);
  return src ? <span className={`official-platform-logo ${className}`} title={label}><img src={src} alt={label} width={32} height={32} /></span> : <span className={className}>{label}</span>;
}
