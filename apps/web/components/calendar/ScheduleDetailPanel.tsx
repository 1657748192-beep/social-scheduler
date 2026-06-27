"use client";

import type { CalendarSchedule } from "../../lib/api";
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
        <h2>{schedule.postVariant.post.title || "Scheduled content"}</h2>
        <button className="button secondary" onClick={onClose} type="button">
          Close
        </button>
      </div>

      <dl className="detail-list">
        <dt>Platform</dt>
        <dd>{schedule.postVariant.platform}</dd>
        <dt>Scheduled</dt>
        <dd>{formatDateTime(scheduledAt)}</dd>
        <dt>Status</dt>
        <dd>{schedule.status}</dd>
        <dt>Publish job</dt>
        <dd>{latestJob ? `${latestJob.status}, attempts ${latestJob.attempts}` : "None"}</dd>
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
          Open published post
        </a>
      ) : null}

      {latestJob?.lastError ? <p className="error">{latestJob.lastError}</p> : null}
    </aside>
  );
}
