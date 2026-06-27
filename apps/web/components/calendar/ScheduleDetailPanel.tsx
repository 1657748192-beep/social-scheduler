"use client";

import type { CalendarSchedule } from "../../lib/api";
import { platformLabel, publishJobStatusLabel, scheduleStatusLabel } from "../../lib/labels";
import { formatDateTime } from "./dateUtils";

type ScheduleDetailPanelProps = {
  schedule: CalendarSchedule | null;
  onClose: () => void;
};

export function ScheduleDetailPanel({ schedule, onClose }: ScheduleDetailPanelProps) {
  if (!schedule) {
    return null;
  }

  const scheduledAt = new Date(schedule.scheduledAt);
  const latestJob = schedule.publishJobs[0];

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

      <div className="detail-copy">{schedule.postVariant.text}</div>

      {schedule.postVariant.media.length ? (
        <div className="detail-media-grid">
          {schedule.postVariant.media.map((item) => (
            <img alt="" key={item.id} src={item.mediaAsset.fileUrl} />
          ))}
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
