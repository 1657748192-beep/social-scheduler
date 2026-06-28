"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  apiRequest,
  type ComposerPlatform,
  type ComposerPost,
  type MediaAsset,
  type Workspace
} from "../../lib/api";
import { chinaLocalInputToISOString } from "../../lib/chinaTime";
import { MediaUploader } from "./MediaUploader";
import { PlatformEditor } from "./PlatformEditor";
import { PlatformTabs } from "./PlatformTabs";
import { PostPreview } from "./PostPreview";
import { SchedulePicker } from "./SchedulePicker";

type ComposerFormProps = {
  token: string;
  workspaces: Workspace[];
};

const defaultPlatforms: ComposerPlatform[] = ["x", "instagram", "facebook"];

export function ComposerForm({ token, workspaces }: ComposerFormProps) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [baseText, setBaseText] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<ComposerPlatform[]>(defaultPlatforms);
  const [activePlatform, setActivePlatform] = useState<ComposerPlatform>("x");
  const [variantTexts, setVariantTexts] = useState<Record<ComposerPlatform, string>>({
    x: "",
    instagram: "",
    facebook: ""
  });
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [result, setResult] = useState<ComposerPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId),
    [workspaceId, workspaces]
  );
  const imageCount = media.filter((asset) => asset.mimeType.startsWith("image/")).length;
  const videoCount = media.filter((asset) => asset.mimeType.startsWith("video/")).length;
  const hasAnyVariantText = selectedPlatforms.some(
    (platform) => (variantTexts[platform] || baseText).trim().length > 0
  );
  const publishChecks = [
    {
      label: "基础文案",
      done: baseText.trim().length > 0 || hasAnyVariantText
    },
    {
      label: "发布平台",
      done: selectedPlatforms.length > 0
    },
    {
      label: "图片或视频",
      done: media.length > 0,
      optional: true
    },
    {
      label: scheduledAt ? "已选择定时发布" : "保存为草稿",
      done: true
    }
  ];

  function togglePlatform(platform: ComposerPlatform) {
    const next = selectedPlatforms.includes(platform)
      ? selectedPlatforms.filter((item) => item !== platform)
      : [...selectedPlatforms, platform];

    if (!next.length) {
      return;
    }

    setSelectedPlatforms(next);

    if (!next.includes(activePlatform)) {
      setActivePlatform(next[0]);
    }
  }

  function applyBaseText() {
    setVariantTexts({
      x: baseText,
      instagram: baseText,
      facebook: baseText
    });
  }

  async function savePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedWorkspace) {
      setError("请先选择工作区");
      return;
    }

    setError(null);
    setResult(null);
    setIsSaving(true);

    try {
      const post = await apiRequest<ComposerPost>(
        `/workspaces/${selectedWorkspace.id}/composer/posts`,
        {
          method: "POST",
          token,
          body: {
            title: title || undefined,
            baseText,
            scheduledAt: scheduledAt ? chinaLocalInputToISOString(scheduledAt) : undefined,
            variants: selectedPlatforms.map((platform) => ({
              platform,
              text: variantTexts[platform] || baseText,
              mediaAssetIds: media.map((asset) => asset.id)
            }))
          }
        }
      );

      setResult(post);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法保存内容");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="composer-layout" onSubmit={savePost}>
      <aside className="composer-sidebar">
        <section className="composer-panel">
          <p className="section-kicker">发布设置</p>
          <h2>工作区</h2>
          <label className="field">
            <span>发布位置</span>
            <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        {selectedWorkspace ? (
          <MediaUploader
            media={media}
            onMediaChange={setMedia}
            token={token}
            workspaceId={selectedWorkspace.id}
          />
        ) : null}

        <SchedulePicker onChange={setScheduledAt} value={scheduledAt} />

        <section className="composer-panel checklist-panel">
          <div className="row">
            <h2>发布检查</h2>
            <span className="muted">
              {publishChecks.filter((item) => item.done).length}/{publishChecks.length}
            </span>
          </div>
          <ul className="check-list">
            {publishChecks.map((item) => (
              <li className={item.done ? "done" : ""} key={item.label}>
                <span>{item.done ? "✓" : "!"}</span>
                <div>
                  <strong>{item.label}</strong>
                  {item.optional ? <small>可选，但有助于提升展示效果</small> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <main className="composer-main">
        <section className="composer-panel composer-head">
          <div className="row">
            <div>
              <p className="section-kicker">内容生产</p>
              <h1>多平台内容编辑器</h1>
            </div>
            <button className="button secondary" onClick={applyBaseText} type="button">
              套用基础文案
            </button>
          </div>
          <label className="field">
            <span>内部标题</span>
            <input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="活动备注或草稿名称"
              value={title}
            />
          </label>
          <label className="field">
            <span>基础文案</span>
            <textarea
              className="composer-textarea compact"
              onChange={(event) => setBaseText(event.target.value)}
              placeholder="先写一版基础文案，再按平台分别调整。"
              required
              value={baseText}
            />
          </label>
          <div className="content-summary">
            <span>{selectedPlatforms.length} 个平台</span>
            <span>{imageCount} 张图片</span>
            <span>{videoCount} 个视频</span>
          </div>
        </section>

        <PlatformTabs
          active={activePlatform}
          onActiveChange={setActivePlatform}
          onToggle={togglePlatform}
          selected={selectedPlatforms}
        />

        <PlatformEditor
          mediaCount={media.length}
          onChange={(value) =>
            setVariantTexts((current) => ({
              ...current,
              [activePlatform]: value
            }))
          }
          platform={activePlatform}
          text={variantTexts[activePlatform] || baseText}
        />

        <div className="composer-actions">
          <button className="button" disabled={isSaving} type="submit">
            {isSaving ? "保存中" : scheduledAt ? "加入排程" : "保存草稿"}
          </button>
          {result ? <span className="muted">已保存内容：{result.id}</span> : null}
          {error ? <span className="error">{error}</span> : null}
        </div>
      </main>

      <PostPreview baseText={baseText} media={media} platforms={selectedPlatforms} texts={variantTexts} />
    </form>
  );
}
