"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import COS from "cos-js-sdk-v5";
import { apiRequest, apiUpload, type CosUploadIntent, type MediaAsset } from "../../lib/api";
import { useLanguage } from "../LanguageProvider";

const maxMediaSizeBytes = 250 * 1024 * 1024;
const uploadConcurrency = 2;

type UploadType = "image" | "video";

type UploadItem = {
  id: string;
  file: File;
  type: UploadType;
  progress: number;
  status: "uploading" | "failed";
  error?: string;
};

type MediaUploaderProps = {
  workspaceId: string;
  token: string;
  media: MediaAsset[];
  label: string;
  description: string;
  disabled?: boolean;
  onMediaChange: (media: MediaAsset[]) => void;
};

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function newUploadId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
}

function createCanvasThumbnail(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
  quality: number
) {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return Promise.resolve<Blob | null>(null);
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

async function createMediaThumbnail(file: File, type: UploadType) {
  const objectUrl = URL.createObjectURL(file);

  try {
    let source: CanvasImageSource;
    let sourceWidth: number;
    let sourceHeight: number;

    if (type === "image") {
      const image = new Image();
      image.decoding = "async";
      image.src = objectUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("无法生成图片缩略图"));
      });
      source = image;
      sourceWidth = image.naturalWidth;
      sourceHeight = image.naturalHeight;
    } else {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = objectUrl;
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("无法读取视频首帧"));
      });

      if (Number.isFinite(video.duration) && video.duration > 0.1) {
        video.currentTime = Math.min(0.1, video.duration / 2);
        await new Promise<void>((resolve, reject) => {
          video.onseeked = () => resolve();
          video.onerror = () => reject(new Error("无法截取视频首帧"));
        });
      }

      source = video;
      sourceWidth = video.videoWidth;
      sourceHeight = video.videoHeight;
    }

    if (!sourceWidth || !sourceHeight) {
      return null;
    }

    const options = [
      { maxDimension: 320, quality: 0.72 },
      { maxDimension: 280, quality: 0.62 },
      { maxDimension: 240, quality: 0.52 },
      { maxDimension: 200, quality: 0.42 }
    ];
    let thumbnail: Blob | null = null;

    for (const option of options) {
      thumbnail = await createCanvasThumbnail(
        source,
        sourceWidth,
        sourceHeight,
        option.maxDimension,
        option.quality
      );

      if (thumbnail && thumbnail.size <= 80 * 1024) {
        break;
      }
    }

    return thumbnail;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function uploadToCos(intent: CosUploadIntent, file: File, onProgress: (percent: number) => void) {
  const cos = new COS({
    getAuthorization: (_options, callback) => {
      callback({
        TmpSecretId: intent.credentials.tmpSecretId,
        TmpSecretKey: intent.credentials.tmpSecretKey,
        SecurityToken: intent.credentials.sessionToken,
        StartTime: intent.credentials.startTime,
        ExpiredTime: intent.credentials.expiredTime
      });
    }
  });

  return cos.uploadFile({
    Bucket: intent.bucket,
    Region: intent.region,
    Key: intent.key,
    Body: file,
    ContentType: file.type,
    SliceSize: 8 * 1024 * 1024,
    ChunkSize: 4 * 1024 * 1024,
    onProgress: ({ percent }) => onProgress(Math.min(100, Math.round(percent * 100)))
  });
}

export function MediaUploader({
  workspaceId,
  token,
  media,
  label,
  description,
  disabled = false,
  onMediaChange
}: MediaUploaderProps) {
  const { t } = useLanguage();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef(media);
  const [uploadingType, setUploadingType] = useState<UploadType | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);

  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  const isUploading = Boolean(uploadingType);
  const imageCount = media.filter((asset) => asset.mimeType.startsWith("image/")).length;
  const videoCount = media.filter((asset) => asset.mimeType.startsWith("video/")).length;

  function updateMedia(nextMedia: MediaAsset[]) {
    mediaRef.current = nextMedia;
    onMediaChange(nextMedia);
  }

  function updateUpload(id: string, patch: Partial<UploadItem>) {
    setUploadItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function validateFile(file: File, type: UploadType) {
    if (file.size > maxMediaSizeBytes) {
      return `文件超过 ${formatFileSize(maxMediaSizeBytes)} 上限`;
    }

    if (!file.type.startsWith(`${type}/`)) {
      return type === "image" ? "请选择有效的图片文件" : "请选择有效的视频文件";
    }

    return null;
  }

  async function uploadOne(item: UploadItem) {
    updateUpload(item.id, { error: undefined, progress: 0, status: "uploading" });

    try {
      let asset: MediaAsset;

      try {
        const intent = await apiRequest<CosUploadIntent>(`/workspaces/${workspaceId}/media/cos/intent`, {
          token,
          method: "POST",
          body: {
            originalName: item.file.name,
            mimeType: item.file.type,
            sizeBytes: item.file.size
          }
        });
        await uploadToCos(intent, item.file, (percent) => updateUpload(item.id, { progress: percent }));
        asset = await apiRequest<MediaAsset>(`/workspaces/${workspaceId}/media/cos/complete`, {
          token,
          method: "POST",
          body: { assetId: intent.assetId }
        });
      } catch (cosError) {
        const isLocalStorage =
          cosError instanceof Error && cosError.message === "COS direct upload is not enabled on this server";

        if (!isLocalStorage) {
          throw cosError;
        }

        const formData = new FormData();
        formData.append("file", item.file);
        const thumbnail = await createMediaThumbnail(item.file, item.type).catch(() => null);

        if (thumbnail) {
          formData.append("thumbnail", new File([thumbnail], "thumbnail.jpg", { type: "image/jpeg" }));
        }

        asset = await apiUpload<MediaAsset>(`/workspaces/${workspaceId}/media`, token, formData, {
          onProgress: ({ percent }) => updateUpload(item.id, { progress: percent })
        });
      }

      updateMedia([...mediaRef.current, asset]);
      setUploadItems((current) => current.filter((upload) => upload.id !== item.id));
    } catch (requestError) {
      updateUpload(item.id, {
        status: "failed",
        error: requestError instanceof Error ? requestError.message : "上传失败，请重试"
      });
    }
  }

  async function runUploadQueue(items: UploadItem[], type: UploadType) {
    setUploadingType(type);
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await uploadOne(item);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(uploadConcurrency, items.length) }, () => worker())
    );
    setUploadingType(null);
  }

  async function uploadMedia(event: ChangeEvent<HTMLInputElement>, type: UploadType) {
    if (disabled) {
      return;
    }

    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!files.length) {
      return;
    }

    const items = files.map<UploadItem>((file) => {
      const error = validateFile(file, type);
      return {
        id: newUploadId(file),
        file,
        type,
        progress: 0,
        status: error ? "failed" : "uploading",
        error: error ?? undefined
      };
    });
    const acceptedItems = items.filter((item) => !item.error);

    setUploadItems((current) => [...current, ...items]);

    if (acceptedItems.length) {
      await runUploadQueue(acceptedItems, type);
    }
  }

  async function retryUpload(item: UploadItem) {
    if (isUploading) {
      return;
    }

    await runUploadQueue([item], item.type);
  }

  function removeMedia(id: string) {
    updateMedia(mediaRef.current.filter((asset) => asset.id !== id));
  }

  return (
    <section className="composer-panel media-panel">
      <p className="upload-hint platform-media-hint">{description}</p>
      <div className="row">
        <div>
          <p className="section-kicker">{t(`素材库 · ${label}`, `Media library · ${label}`)}</p>
          <h2>{t(`${label} 图片与视频`, `${label} images and videos`)}</h2>
        </div>
        <span className="muted">
          {t(`${imageCount} 图 / ${videoCount} 视频`, `${imageCount} images / ${videoCount} videos`)}
        </span>
      </div>

      <div className="upload-actions">
        <input
          accept="image/*"
          disabled={isUploading || disabled}
          multiple
          onChange={(event) => uploadMedia(event, "image")}
          ref={imageInputRef}
          type="file"
        />
        <input
          accept="video/*"
          disabled={isUploading || disabled}
          multiple
          onChange={(event) => uploadMedia(event, "video")}
          ref={videoInputRef}
          type="file"
        />
        <button
          className="upload-drop"
          disabled={isUploading || disabled}
          onClick={() => imageInputRef.current?.click()}
          type="button"
        >
          <strong>{uploadingType === "image" ? t("图片上传中…", "Uploading images...") : t("添加图片", "Add images")}</strong>
          <span>{t("支持多张图片，单个最大 250 MB", "Multiple images supported, up to 250 MB each")}</span>
        </button>
        <button
          className="upload-drop video"
          disabled={isUploading || disabled}
          onClick={() => videoInputRef.current?.click()}
          type="button"
        >
          <strong>{uploadingType === "video" ? t("视频上传中…", "Uploading videos...") : t("添加视频", "Add videos")}</strong>
          <span>{t("支持并行上传，单个最大 250 MB", "Parallel upload supported, up to 250 MB each")}</span>
        </button>
      </div>

      {uploadItems.length ? (
        <div className="upload-queue" aria-live="polite">
          {uploadItems.map((item) => (
            <div className={item.status === "failed" ? "upload-queue-item failed" : "upload-queue-item"} key={item.id}>
              <div className="upload-queue-heading">
                <span>
                  <strong>{item.file.name}</strong>
                  <small>{formatFileSize(item.file.size)}</small>
                </span>
                {item.status === "uploading" ? <em>{item.progress}%</em> : null}
                {item.status === "failed" ? (
                  <button disabled={isUploading} onClick={() => retryUpload(item)} type="button">
                    {t("重试", "Retry")}
                  </button>
                ) : null}
              </div>
              {item.status === "uploading" ? (
                <div className="upload-progress-track" aria-label={t(`${item.file.name} 上传进度`, `${item.file.name} upload progress`)}>
                  <span style={{ width: `${item.progress}%` }} />
                </div>
              ) : null}
              {item.error ? <p>{item.error}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {media.length ? (
        <div className="media-grid">
          {media.map((asset) => {
            const isVideo = asset.mimeType.startsWith("video/");
            const thumbnailUrl = asset.thumbnailUrl ?? asset.fileUrl;

            return (
              <article className="media-thumb" key={asset.id}>
                <div className="media-thumb-visual">
                  {thumbnailUrl ? (
                    <>
                      <img alt={isVideo ? t("视频首帧缩略图", "Video cover thumbnail") : t("图片素材缩略图", "Image thumbnail")} src={thumbnailUrl} />
                      {isVideo ? <span className="media-badge">{t("视频", "Video")}</span> : null}
                    </>
                  ) : (
                    <span className="media-badge">{t("缩略图不可用", "No thumbnail")}</span>
                  )}
                </div>
                <div className="media-thumb-footer">
                  <span>{isVideo ? t("视频素材", "Video") : t("图片素材", "Image")}</span>
                  <div className="media-thumb-actions">
                    <button onClick={() => setPreviewAsset(asset)} type="button">
                      {isVideo ? t("观看视频", "Watch video") : t("预览图片", "Preview image")}
                    </button>
                    <button className="media-remove" onClick={() => removeMedia(asset.id)} type="button">
                      {t("移除", "Remove")}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="upload-hint">{t("上传后会显示缩略图；可预览素材或将其移除。", "A thumbnail appears after upload. Preview or remove media here.")}</p>
      )}

      {previewAsset ? (
        <div
          className="media-preview-backdrop"
          onClick={() => setPreviewAsset(null)}
          role="presentation"
        >
          <section
            aria-label={previewAsset.mimeType.startsWith("video/") ? t("视频预览", "Video preview") : t("图片预览", "Image preview")}
            aria-modal="true"
            className="media-preview-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="media-preview-header">
              <div>
                <p className="section-kicker">{t("素材预览", "Media preview")}</p>
                <h2>{previewAsset.mimeType.startsWith("video/") ? t("观看视频", "Watch video") : t("预览图片", "Preview image")}</h2>
              </div>
              <button aria-label={t("关闭预览", "Close preview")} onClick={() => setPreviewAsset(null)} type="button">
                ×
              </button>
            </header>
            <div className="media-preview-content">
              {previewAsset.mimeType.startsWith("video/") ? (
                <video autoPlay controls playsInline preload="metadata" src={previewAsset.fileUrl} />
              ) : (
                <img alt={t("图片素材预览", "Image media preview")} src={previewAsset.fileUrl} />
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
