"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  apiRequest,
  type ComposerPlatform,
  type ComposerPost,
  type MediaAsset,
  type Workspace
} from "../../lib/api";
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
      setError("Select a workspace first");
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
            scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
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
      setError(requestError instanceof Error ? requestError.message : "Could not save content");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="composer-layout" onSubmit={savePost}>
      <aside className="composer-sidebar">
        <section className="composer-panel">
          <h2>Workspace</h2>
          <label className="field">
            <span>Destination</span>
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
      </aside>

      <main className="composer-main">
        <section className="composer-panel">
          <div className="row">
            <h1>Content Composer</h1>
            <button className="button secondary" onClick={applyBaseText} type="button">
              Apply base text
            </button>
          </div>
          <label className="field">
            <span>Internal title</span>
            <input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Campaign note or draft name"
              value={title}
            />
          </label>
          <label className="field">
            <span>Base text</span>
            <textarea
              className="composer-textarea compact"
              onChange={(event) => setBaseText(event.target.value)}
              placeholder="Write the source version, then adapt it by platform."
              required
              value={baseText}
            />
          </label>
        </section>

        <PlatformTabs
          active={activePlatform}
          onActiveChange={setActivePlatform}
          onToggle={togglePlatform}
          selected={selectedPlatforms}
        />

        <PlatformEditor
          imageCount={media.length}
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
            {isSaving ? "Saving" : scheduledAt ? "Schedule post" : "Save draft"}
          </button>
          {result ? <span className="muted">Saved post {result.id}</span> : null}
          {error ? <span className="error">{error}</span> : null}
        </div>
      </main>

      <PostPreview media={media} platforms={selectedPlatforms} texts={variantTexts} />
    </form>
  );
}
