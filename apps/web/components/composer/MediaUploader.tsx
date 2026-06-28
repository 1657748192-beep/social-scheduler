"use client";

import { ChangeEvent, useRef, useState } from "react";
import { apiUpload, type MediaAsset } from "../../lib/api";

type MediaUploaderProps = {
  workspaceId: string;
  token: string;
  media: MediaAsset[];
  onMediaChange: (media: MediaAsset[]) => void;
};

export function MediaUploader({ workspaceId, token, media, onMediaChange }: MediaUploaderProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingType, setUploadingType] = useState<"image" | "video" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isUploading = Boolean(uploadingType);
  const imageCount = media.filter((asset) => asset.mimeType.startsWith("image/")).length;
  const videoCount = media.filter((asset) => asset.mimeType.startsWith("video/")).length;

  async function uploadMedia(event: ChangeEvent<HTMLInputElement>, type: "image" | "video") {
    const files = Array.from(event.target.files ?? []);

    if (!files.length) {
      return;
    }

    setError(null);
    setUploadingType(type);

    try {
      const uploadedAssets: MediaAsset[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const asset = await apiUpload<MediaAsset>(`/workspaces/${workspaceId}/media`, token, formData);
        uploadedAssets.push(asset);
      }

      onMediaChange([...media, ...uploadedAssets]);
      event.target.value = "";
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "上传失败");
    } finally {
      setUploadingType(null);
    }
  }

  function removeMedia(id: string) {
    onMediaChange(media.filter((asset) => asset.id !== id));
  }

  return (
    <section className="composer-panel media-panel">
      <div className="row">
        <div>
          <p className="section-kicker">素材库</p>
          <h2>图片与视频</h2>
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
          <strong>{uploadingType === "image" ? "图片上传中" : "添加图片"}</strong>
          <span>支持多张图片</span>
        </button>
        <button
          className="upload-drop video"
          disabled={isUploading}
          onClick={() => videoInputRef.current?.click()}
          type="button"
        >
          <strong>{uploadingType === "video" ? "视频上传中" : "添加视频"}</strong>
          <span>用于 Reels、短视频或动态</span>
        </button>
      </div>

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

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
