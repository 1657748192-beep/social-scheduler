"use client";

import { Fragment, useState } from "react";
import type { ComposerPlatform, MediaAsset } from "../../lib/api";
import { useLanguage } from "../LanguageProvider";
import { PlatformLogo } from "../PlatformLogo";
import type { ComposerSocialAccount } from "./platformConfig";
import { platformLimits } from "./platformConfig";

// Tokenize URLs first, so their fragment identifiers never become hashtags.
// React renders every token as text: captions cannot inject markup or scripts.
function HashtagText({ text }: { text: string }) {
  const pieces: React.ReactNode[] = [];
  const tokens = /https?:\/\/[^\s]+|www\.[^\s]+|[#＃][\p{L}\p{M}\p{N}_]+/gu;
  let end = 0, previousTagEnd = -1;
  for (const match of text.matchAll(tokens)) {
    const start = match.index!;
    pieces.push(text.slice(end, start));
    const isTag = /^[#＃]/.test(match[0]) && (start === 0 || start === previousTagEnd || !/[\p{L}\p{M}\p{N}_/]/u.test(Array.from(text.slice(Math.max(0, start - 2), start)).at(-1)!));
    pieces.push(isTag ? <span className="preview-hashtag" key={start}>{match[0]}</span> : match[0]);
    end = start + match[0].length;
    previousTagEnd = isTag ? end : -1;
  }
  pieces.push(text.slice(end));
  return <>{pieces.map((piece, i) => <Fragment key={i}>{piece}</Fragment>)}</>;
}

function PostIcon({ kind }: { kind: "heart" | "comment" | "send" | "save" | "like" | "share" }) {
  const paths = {
    heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
    comment: "M21 11.5a9 9 0 0 1-9.5 9L3 22l1.5-7.5A9 9 0 1 1 21 11.5Z",
    send: "m22 2-7 20-4-9-9-4 20-7Zm0 0L11 13",
    save: "M5 3h14v19l-7-5-7 5V3Z",
    like: "M7 10H3v11h4V10Zm0 0 5-8c3 0 2 5 1 7h6c2 0 2 2 1 5l-2 7H7V10Z",
    share: "m14 3 8 7-8 7v-4C7 13 4 16 2 20c0-9 4-13 12-13V3Z"
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

export function PlatformPostPreview({ platform, account, text, media, pinTitle, destination }: {
  platform: ComposerPlatform; account?: ComposerSocialAccount; text: string; media: MediaAsset[]; pinTitle?: string; destination?: string;
}) {
  const { t } = useLanguage();
  const [mediaIndex, setMediaIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const index = Math.min(mediaIndex, Math.max(0, media.length - 1));
  const asset = media[index];
  const isVideo = asset?.mimeType.startsWith("video/");
  const available = asset?.originalAvailable !== false && !asset?.originalDeletedAt;
  const name = account?.displayName || t("发布账号", "Publishing account");
  const characters = Array.from(text);
  const truncated = characters.length > 220 && !expanded;
  const caption = <div className="native-preview-caption" data-preview-slot="caption">
    {platform === "instagram" ? <strong className="native-caption-author">{name} </strong> : null}
    <HashtagText text={text ? truncated ? characters.slice(0, 220).join("") + "…" : text : t("这里会显示你填写的帖子文案。", "Your post copy will appear here.")} />
    {characters.length > 220 ? <button type="button" className="native-caption-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? t("收起", "Show less") : t("展开全文", "Show more")}</button> : null}
  </div>;
  const author = <div className="native-preview-author">
    <span className="native-preview-avatar">{account?.avatarUrl && !avatarFailed ? <img src={account.avatarUrl} alt="" onError={() => setAvatarFailed(true)} /> : Array.from(name)[0]?.toUpperCase()}</span>
    <div><strong>{name}</strong><small>{t("发布后效果模拟", "Simulated post")}</small></div>
    <span className="native-preview-more" aria-hidden="true">···</span>
  </div>;
  const gallery = <div className={`native-preview-media ${isVideo ? "is-video" : ""}`} data-preview-slot="media">
    {!asset ? <div className="native-preview-empty">{t("尚未添加素材", "No media selected")}</div> : isVideo && available ? (
      <video key={asset.id} src={asset.fileUrl} poster={asset.thumbnailUrl || undefined} controls playsInline preload="none" aria-label={t("视频预览", "Video preview")} />
    ) : asset.thumbnailUrl || (!isVideo && available) ? (
      <><img src={asset.thumbnailUrl || asset.fileUrl} alt={t(`素材 ${index + 1}`, `Media ${index + 1}`)} />{isVideo ? <span className="native-preview-cover-note">{t("仅封面预览，原视频不可用", "Cover only; original video unavailable")}</span> : null}</>
    ) : <div className="native-preview-empty">{t("原素材已过期，无法预览", "Original media expired; preview unavailable")}</div>}
    {media.length > 1 ? <>
      <span className="native-preview-page">{index + 1}/{media.length}</span>
      <button className="native-preview-previous" type="button" aria-label={t("上一张", "Previous media")} aria-disabled={index === 0} onClick={() => { if(index > 0)setMediaIndex(index - 1); }}>‹</button>
      <button className="native-preview-next" type="button" aria-label={t("下一张", "Next media")} aria-disabled={index === media.length - 1} onClick={() => { if(index < media.length - 1)setMediaIndex(index + 1); }}>›</button>
    </> : null}
  </div>;
  const actions = <div className={`native-preview-actions ${platform === "tiktok" ? "vertical" : ""}`} aria-label={t("平台操作栏示意", "Simulated platform actions")}>
    <span><PostIcon kind={platform === "facebook" || platform === "youtube" ? "like" : "heart"} />{platform === "facebook" ? t("赞", "Like") : null}</span>
    <span><PostIcon kind="comment" />{platform === "facebook" ? t("评论", "Comment") : null}</span>
    <span><PostIcon kind={platform === "facebook" ? "share" : "send"} />{platform === "facebook" ? t("分享", "Share") : null}</span>
    {platform === "instagram" || platform === "tiktok" ? <span className="native-preview-save"><PostIcon kind="save" /></span> : null}
  </div>;

  return <article className={`native-post-preview ${platform}`} data-platform={platform} data-layout={platform === "tiktok" ? "video-overlay" : platform === "pinterest" ? "pin" : platform === "youtube" ? "watch" : "feed"}>
    <div className="native-preview-brand"><PlatformLogo platform={platform} /><strong>{platformLimits[platform].label}</strong><span>{t("预览", "Preview")}</span></div>
    {platform === "facebook" ? <>{author}{caption}{gallery}{actions}</> :
      platform === "instagram" ? <>{author}{gallery}{actions}{caption}</> :
      platform === "tiktok" ? <div className="native-tiktok-stage">{gallery}{actions}<div className="native-tiktok-overlay"><strong>{/^[\w.]+$/.test(name) ? "@" : ""}{name}</strong>{caption}<small>♫ {t("音频效果以发布后为准", "Audio appearance is determined after publishing")}</small></div></div> :
      platform === "pinterest" ? <><div className="native-pin-toolbar"><span>···</span><span className="native-pin-save">{t("保存", "Save")}</span></div>{gallery}{pinTitle ? <h3 className="pinterest-pin-title">{pinTitle}</h3> : null}{author}{caption}{destination ? <p className="pinterest-pin-destination">{t("点击 Pin 将跳转至：", "This Pin will open:")} {destination}</p> : null}</> :
      <>{gallery}{author}{caption}{actions}</>}
  </article>;
}
