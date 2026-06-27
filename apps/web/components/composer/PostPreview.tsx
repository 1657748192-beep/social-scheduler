"use client";

import type { ComposerPlatform, MediaAsset } from "../../lib/api";
import { platformLimits } from "./platformConfig";

type PostPreviewProps = {
  platforms: ComposerPlatform[];
  texts: Record<ComposerPlatform, string>;
  media: MediaAsset[];
};

export function PostPreview({ platforms, texts, media }: PostPreviewProps) {
  return (
    <section className="composer-panel preview-rail">
      <div className="row">
        <h2>Preview</h2>
        <span className="muted">{platforms.length} platforms</span>
      </div>

      <div className="preview-stack">
        {platforms.map((platform) => {
          const limit = platformLimits[platform];
          return (
            <article className={`preview-card ${platform}`} key={platform}>
              <div className="preview-top">
                <div className="preview-avatar">{limit.label.slice(0, 1)}</div>
                <div>
                  <strong>{limit.label}</strong>
                  <div className="muted">@connected-account</div>
                </div>
              </div>
              <p>{texts[platform] || "Platform-specific copy appears here."}</p>
              {media.length ? (
                <div className={`preview-images count-${Math.min(media.length, 4)}`}>
                  {media.slice(0, 4).map((asset) => (
                    <img alt="" key={asset.id} src={asset.fileUrl} />
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
