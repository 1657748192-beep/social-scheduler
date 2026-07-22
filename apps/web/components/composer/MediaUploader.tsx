"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { apiUpload, type MediaAsset } from "../../lib/api";

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

export function MediaUploader({
  workspaceId,
  token,
  media,
  label,
  description,
  onMediaChange
}: MediaUploaderProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef(media);
  const [uploadingType, setUploadingType] = useState<UploadType | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);

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
    const formData = new FormData();
    formData.append("file", item.file);
    updateUpload(item.id, { error: undefined, progress: 0, status: "uploading" });

    try {
      const asset = await apiUpload<MediaAsset>(`/workspaces/${workspaceId}/media`, token, formData, {
        onProgress: ({ percent }) => updateUpload(item.id, { progress: percent })
      });
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
          <p className="section-kicker">素材库 · {label}</p>
          <h2>{label} 图片与视频</h2>
        </div>
        <span className="muted">
          {imageCount} 图 / {videoCount} 视频
        </span>
      </div>

      <div className="upload-actions">
        <input
          accept="image/*"
          disabled={isUploading}
          multiple
          onChange={(event) => uploadMedia(event, "image")}
          ref={imageInputRef}
          type="file"
        />
        <input
          accept="video/*"
          disabled={isUploading}
          multiple
          onChange={(event) => uploadMedia(event, "video")}
          ref={videoInputRef}
          type="file"
        />
        <button
          className="upload-drop"
          disabled={isUploading}
          onClick={() => imageInputRef.current?.click()}
          type="button"
        >
          <strong>{uploadingType === "image" ? "图片上传中…" : "添加图片"}</strong>
          <span>支持多张图片，单个最大 250 MB</span>
        </button>
        <button
          className="upload-drop video"
          disabled={isUploading}
          onClick={() => videoInputRef.current?.click()}
          type="button"
        >
          <strong>{uploadingType === "video" ? "视频上传中…" : "添加视频"}</strong>
          <span>支持并行上传，单个最大 250 MB</span>
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
                    重试
                  </button>
                ) : null}
              </div>
              {item.status === "uploading" ? (
                <div className="upload-progress-track" aria-label={`${item.file.name} 上传进度`}>
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
          {media.map((asset) => (
            <button
              className="media-thumb"
              key={asset.id}
              onClick={() => removeMedia(asset.id)}
              title="点击移除素材"
              type="button"
            >
              {asset.mimeType.startsWith("video/") ? (
                <>
                  <video muted preload="metadata" src={asset.fileUrl} />
                  <span className="media-badge">视频</span>
                </>
              ) : (
                <img alt="" src={asset.fileUrl} />
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="upload-hint">上传后会显示缩略图；点击缩略图可移除素材。</p>
      )}
    </section>
  );
}
