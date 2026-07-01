"use client";

import type { ComposerPlatform, MediaAsset, SocialAccount } from "../../lib/api";
import { platformLimits } from "./platformConfig";

type PostPreviewProps = {
  platforms: ComposerPlatform[];
  texts: Record<ComposerPlatform, string>;
  baseText: string;
  media: MediaAsset[];
  accountsByPlatform: Partial<Record<ComposerPlatform, SocialAccount>>;
  loading: boolean;
};

export function PostPreview({
  platforms,
  texts,
  baseText,
  media,
  accountsByPlatform,
  loading
}: PostPreviewProps) {
  return (
    <section className="composer-panel preview-rail">
      <div className="row">
        <div>
          <p className="section-kicker">实时预览</p>
          <h2>发布效果</h2>
        </div>
        <span className="muted">{platforms.length} 个平台</span>
      </div>

      <div className="preview-stack">
        {!platforms.length ? (
          <p className="muted preview-empty">
            {loading ? "正在读取绑定账号..." : "当前工作区还没有选择发布平台。"}
          </p>
        ) : null}
        {platforms.map((platform) => {
          const limit = platformLimits[platform];
          const text = texts[platform] || baseText;
          const account = accountsByPlatform[platform];
          const accountLabel = loading
            ? "正在读取账号"
            : account
              ? `@${account.displayName}`
              : "@未绑定账号";

          return (
            <article className={`preview-card ${platform} ${account ? "" : "unbound"}`} key={platform}>
              <div className="preview-top">
                <div className="preview-avatar">{limit.label.slice(0, 1)}</div>
                <div>
                  <strong>{limit.label}</strong>
                  <div className="muted">{accountLabel}</div>
                </div>
              </div>
              <p>{text || "这里会显示该平台的专属文案。"}</p>
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
