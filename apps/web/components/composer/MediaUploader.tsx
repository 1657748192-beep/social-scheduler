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
    <section className="composer-panel">
      <div className="row">
        <h2>素材</h2>
        <span className="muted">
          图片 {imageCount} / 视频 {videoCount}
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
          <span>{uploadingType === "image" ? "图片上传中" : "添加图片"}</span>
        </button>
        <button
          className="upload-drop video"
          disabled={isUploading}
          onClick={() => videoInputRef.current?.click()}
          type="button"
        >
          <span>{uploadingType === "video" ? "视频上传中" : "添加视频"}</span>
        </button>
      </div>

      <div className="media-grid">
        {media.map((asset) => (
          <button
            className="media-thumb"
            key={asset.id}
            onClick={() => removeMedia(asset.id)}
            title="移除素材"
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

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
