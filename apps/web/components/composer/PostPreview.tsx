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
        <h2>预览</h2>
        <span className="muted">{platforms.length} 个平台</span>
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
                  <div className="muted">@已绑定账号</div>
                </div>
              </div>
              <p>{texts[platform] || "这里会显示该平台的专属文案。"}</p>
              {media.length ? (
                <div className={`preview-images count-${Math.min(media.length, 4)}`}>
                  {media.slice(0, 4).map((asset) =>
                    asset.mimeType.startsWith("video/") ? (
                      <div className="preview-video" key={asset.id}>
                        <video muted preload="metadata" src={asset.fileUrl} />
                        <span>视频</span>
                      </div>
                    ) : (
                      <img alt="" key={asset.id} src={asset.fileUrl} />
                    )
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
