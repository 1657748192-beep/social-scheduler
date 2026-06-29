"use client";

import { type FormEvent, useEffect, useState } from "react";
import { BeijingDateTimePicker } from "../BeijingDateTimePicker";
import { apiRequest, type CalendarSchedule } from "../../lib/api";
import {
  APP_TIME_ZONE_LABEL,
  chinaLocalInputToISOString,
  toChinaDatetimeLocalValue
} from "../../lib/chinaTime";
import { platformLabel, publishJobStatusLabel, scheduleStatusLabel } from "../../lib/labels";
import { formatDateTime } from "./dateUtils";

type ScheduleDetailPanelProps = {
  schedule: CalendarSchedule | null;
  onClose: () => void;
  onDeleted: (scheduleId: string) => void;
  onUpdated: (schedule: CalendarSchedule) => void;
  token: string;
  workspaceId: string;
};

export function ScheduleDetailPanel({
  schedule,
  onClose,
  onDeleted,
  onUpdated,
  token,
  workspaceId
}: ScheduleDetailPanelProps) {
  const [text, setText] = useState("");
  const [scheduledAtValue, setScheduledAtValue] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!schedule) {
      return;
    }

    setText(schedule.postVariant.text);
    setScheduledAtValue(toChinaDatetimeLocalValue(new Date(schedule.scheduledAt)));
    setFeedback(null);
    setFormError(null);
  }, [schedule?.id, schedule?.postVariant.text, schedule?.scheduledAt]);

  if (!schedule) {
    return null;
  }

  const scheduledAt = new Date(schedule.scheduledAt);
  const latestJob = schedule.publishJobs[0];
  const canEditSchedule = schedule.status === "scheduled";
  const minDateTime = toChinaDatetimeLocalValue(new Date(Date.now() + 60 * 1000));

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!schedule || !canEditSchedule) {
      return;
    }

    const trimmedText = text.trim();

    if (!trimmedText) {
      setFormError("内容不能为空");
      return;
    }

    if (!scheduledAtValue) {
      setFormError("请选择发布时间");
      return;
    }

    let scheduledAtIso = "";

    try {
      scheduledAtIso = chinaLocalInputToISOString(scheduledAtValue);
    } catch {
      setFormError("发布时间格式不正确");
      return;
    }

    setFormError(null);
    setFeedback(null);
    setIsSaving(true);

    try {
      const updated = await apiRequest<CalendarSchedule>(
        `/workspaces/${workspaceId}/schedules/${schedule.id}`,
        {
          method: "PATCH",
          token,
          body: {
            scheduledAt: scheduledAtIso,
            timezone: "Asia/Shanghai",
            text: trimmedText
          }
        }
      );

      onUpdated(updated);
      setFeedback("修改已保存");
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!schedule || !canEditSchedule) {
      return;
    }

    const confirmed = window.confirm("确定删除这个排程任务吗？删除后不会再自动发布。");

    if (!confirmed) {
      return;
    }

    setFormError(null);
    setFeedback(null);
    setIsDeleting(true);

    try {
      await apiRequest<CalendarSchedule>(
        `/workspaces/${workspaceId}/schedules/${schedule.id}/cancel`,
        {
          method: "POST",
          token
        }
      );
      onDeleted(schedule.id);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "删除失败");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <aside className="schedule-detail">
      <div className="row">
        <h2>{schedule.postVariant.post.title || "已排程内容"}</h2>
        <button className="button secondary" onClick={onClose} type="button">
          关闭
        </button>
      </div>

      <dl className="detail-list">
        <dt>平台</dt>
        <dd>{platformLabel(schedule.postVariant.platform)}</dd>
        <dt>发布时间</dt>
        <dd>{formatDateTime(scheduledAt)}</dd>
        <dt>状态</dt>
        <dd>{scheduleStatusLabel(schedule.status)}</dd>
        <dt>发布任务</dt>
        <dd>
          {latestJob
            ? `${publishJobStatusLabel(latestJob.status)}，已尝试 ${latestJob.attempts} 次`
            : "暂无"}
        </dd>
      </dl>

      {canEditSchedule ? (
        <form className="schedule-edit-form" onSubmit={handleSave}>
          <label className="field">
            <span>任务内容</span>
            <textarea
              onChange={(event) => setText(event.target.value)}
              value={text}
            />
          </label>

          <label className="field">
            <span>发布时间</span>
            <BeijingDateTimePicker
              min={minDateTime}
              onChange={setScheduledAtValue}
              required
              value={scheduledAtValue}
            />
          </label>
          <p className="muted">按 {APP_TIME_ZONE_LABEL} 保存。</p>

          <div className="schedule-edit-actions">
            <button className="button" disabled={isSaving || isDeleting} type="submit">
              {isSaving ? "保存中" : "保存修改"}
            </button>
            <button
              className="button danger-button"
              disabled={isSaving || isDeleting}
              onClick={handleDelete}
              type="button"
            >
              {isDeleting ? "删除中" : "删除任务"}
            </button>
          </div>

          {feedback ? <p className="success-text">{feedback}</p> : null}
          {formError ? <p className="error">{formError}</p> : null}
        </form>
      ) : (
        <>
          <div className="detail-copy">{schedule.postVariant.text}</div>
          <p className="muted">只有未开始的排程任务可以修改或删除。</p>
        </>
      )}

      {schedule.postVariant.media.length ? (
        <div className="detail-media-grid">
          {schedule.postVariant.media.map((item) =>
            item.mediaAsset.mimeType.startsWith("video/") ? (
              <video controls key={item.id} preload="metadata" src={item.mediaAsset.fileUrl} />
            ) : (
              <img alt="" key={item.id} src={item.mediaAsset.fileUrl} />
            )
          )}
        </div>
      ) : null}

      {latestJob?.providerPermalink ? (
        <a className="button" href={latestJob.providerPermalink} rel="noreferrer" target="_blank">
          打开已发布内容
        </a>
      ) : null}

      {latestJob?.lastError ? <p className="error">{latestJob.lastError}</p> : null}
    </aside>
  );
}
