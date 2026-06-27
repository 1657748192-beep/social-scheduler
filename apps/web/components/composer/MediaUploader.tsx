"use client";

import { ChangeEvent, useState } from "react";
import { apiUpload, type MediaAsset } from "../../lib/api";

type MediaUploaderProps = {
  workspaceId: string;
  token: string;
  media: MediaAsset[];
  onMediaChange: (media: MediaAsset[]) => void;
};

export function MediaUploader({ workspaceId, token, media, onMediaChange }: MediaUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError(null);
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const asset = await apiUpload<MediaAsset>(`/workspaces/${workspaceId}/media`, token, formData);
      onMediaChange([...media, asset]);
      event.target.value = "";
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "上传失败");
    } finally {
      setIsUploading(false);
    }
  }

  function removeMedia(id: string) {
    onMediaChange(media.filter((asset) => asset.id !== id));
  }

  return (
    <section className="composer-panel">
      <div className="row">
        <h2>图片</h2>
        <span className="muted">{media.length}</span>
      </div>

      <label className="upload-drop">
        <input accept="image/*" disabled={isUploading} onChange={uploadImage} type="file" />
        <span>{isUploading ? "上传中" : "选择图片"}</span>
      </label>

      <div className="media-grid">
        {media.map((asset) => (
          <button
            className="media-thumb"
            key={asset.id}
            onClick={() => removeMedia(asset.id)}
            title="移除图片"
            type="button"
          >
            <img alt="" src={asset.fileUrl} />
          </button>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
