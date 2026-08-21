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
import { useLanguage } from "../LanguageProvider";

type ScheduleDetailPanelProps = {
  schedule: CalendarSchedule | null;
  onClose: () => void;
  onDeleted: (scheduleId: string) => void;
  onUpdated: (schedule: CalendarSchedule) => void;
  token: string;
  publishingLocked?: boolean;
  workspaceId: string;
};

export function ScheduleDetailPanel({
  schedule,
  onClose,
  onDeleted,
  onUpdated,
  token,
  publishingLocked = false,
  workspaceId
}: ScheduleDetailPanelProps) {
  const { locale, t } = useLanguage();
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
  const canModifySchedule = canEditSchedule && !publishingLocked;
  const canDeleteSchedule = schedule.status === "scheduled" || schedule.status === "failed";
  const minDateTime = toChinaDatetimeLocalValue(new Date(Date.now() + 60 * 1000));

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!schedule || !canModifySchedule) {
      return;
    }

    const trimmedText = text.trim();

    if (!trimmedText) {
      setFormError(t("内容不能为空", "Content cannot be empty"));
      return;
    }

    if (!scheduledAtValue) {
      setFormError(t("请选择发布时间", "Choose a publishing time"));
      return;
    }

    let scheduledAtIso = "";

    try {
      scheduledAtIso = chinaLocalInputToISOString(scheduledAtValue);
    } catch {
      setFormError(t("发布时间格式不正确", "Invalid publishing time"));
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
      setFeedback(t("修改已保存", "Changes saved"));
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : t("保存失败", "Unable to save"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!schedule || !canDeleteSchedule) {
      return;
    }

    const confirmed = window.confirm(
      schedule.status === "failed"
        ? t("确定从日历中删除这个发布失败的任务吗？素材和发布记录会保留，不会再自动重试。", "Remove this failed task from the calendar? Media and publishing records are kept, and it will not retry automatically.")
        : t("确定删除这个排程任务吗？删除后不会再自动发布。", "Delete this scheduled task? It will no longer publish automatically.")
    );

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
      setFormError(requestError instanceof Error ? requestError.message : t("删除失败", "Unable to delete"));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <aside className="schedule-detail">
      <div className="row">
        <h2>{schedule.postVariant.post.title || t("已排程内容", "Scheduled content")}</h2>
        <button className="button secondary" onClick={onClose} type="button">
          {t("关闭", "Close")}
        </button>
      </div>

      <dl className="detail-list">
        <dt>{t("平台", "Platform")}</dt>
        <dd>{platformLabel(schedule.postVariant.platform)}</dd>
        <dt>{t("发布账号", "Publishing account")}</dt>
        <dd>{schedule.postVariant.socialAccount?.displayName ?? t("未指定（旧任务）", "Unspecified (legacy task)")}</dd>
        <dt>{t("发布时间", "Publishing time")}</dt>
        <dd>{formatDateTime(scheduledAt)}</dd>
        <dt>{t("状态", "Status")}</dt>
        <dd>{scheduleStatusLabel(schedule.status, locale)}</dd>
        <dt>{t("发布任务", "Publishing task")}</dt>
        <dd>
          {latestJob
            ? t(`${publishJobStatusLabel(latestJob.status, locale)}，已尝试 ${latestJob.attempts} 次`, `${publishJobStatusLabel(latestJob.status, locale)}, attempted ${latestJob.attempts} times`)
            : t("暂无", "None")}
        </dd>
      </dl>

      {canModifySchedule ? (
        <form className="schedule-edit-form" onSubmit={handleSave}>
          <label className="field">
            <span>{t("任务内容", "Task content")}</span>
            <textarea
              onChange={(event) => setText(event.target.value)}
              value={text}
            />
          </label>

          <label className="field">
            <span>{t("发布时间", "Publishing time")}</span>
            <BeijingDateTimePicker
              min={minDateTime}
              onChange={setScheduledAtValue}
              required
              value={scheduledAtValue}
            />
          </label>
          <p className="muted">{t(`按 ${APP_TIME_ZONE_LABEL} 保存。`, `Saved in ${APP_TIME_ZONE_LABEL}.`)}</p>

          <div className="schedule-edit-actions">
            <button className="button" disabled={isSaving || isDeleting} type="submit">
              {isSaving ? t("保存中", "Saving...") : t("保存修改", "Save changes")}
            </button>
            <button
              className="button danger-button"
              disabled={isSaving || isDeleting}
              onClick={handleDelete}
              type="button"
            >
              {isDeleting ? t("删除中", "Deleting...") : t("删除任务", "Delete task")}
            </button>
          </div>

          {feedback ? <p className="success-text">{feedback}</p> : null}
          {formError ? <p className="error">{formError}</p> : null}
        </form>
      ) : (
        <>
          <div className="detail-copy">{schedule.postVariant.text}</div>
          {canDeleteSchedule ? (
            <div className="schedule-edit-actions">
              <button
                className="button danger-button"
                disabled={isDeleting}
                onClick={handleDelete}
                type="button"
              >
                {isDeleting
                  ? t("正在删除…", "Deleting...")
                  : schedule.status === "failed"
                    ? t("删除失败任务", "Delete failed task")
                    : t("删除任务", "Delete task")}
              </button>
              {publishingLocked && schedule.status === "scheduled" ? (
                <p className="muted">{t("测试权限已到期，不能修改排程或发布内容。", "Test access has expired. Scheduling and publishing cannot be changed.")}</p>
              ) : null}
            </div>
          ) : (
            <p className="muted">{t("此任务已完成，不能再修改或删除。", "This task is complete and can no longer be changed or deleted.")}</p>
          )}
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
          {t("打开已发布内容", "Open published post")}
        </a>
      ) : latestJob?.providerProfilePermalink ? (
        <a className="button secondary" href={latestJob.providerProfilePermalink} rel="noreferrer" target="_blank">
          {t("打开 TikTok 主页", "Open TikTok profile")}
        </a>
      ) : null}

      {latestJob?.lastError ? <p className="error">{latestJob.lastError}</p> : null}
    </aside>
  );
}
