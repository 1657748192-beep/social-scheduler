"use client";

import type { CalendarSchedule } from "../../lib/api";
import { formatTime } from "./dateUtils";

type CalendarEventItemProps = {
  schedule: CalendarSchedule;
  onClick: (schedule: CalendarSchedule) => void;
};

export function CalendarEventItem({ schedule, onClick }: CalendarEventItemProps) {
  const scheduledAt = new Date(schedule.scheduledAt);
  const thumbnail = schedule.postVariant.media[0]?.mediaAsset;

  return (
    <button
      className={`calendar-event ${schedule.postVariant.platform} ${schedule.status}`}
      draggable={schedule.status === "scheduled"}
      onClick={(event) => {
        event.stopPropagation();
        onClick(schedule);
      }}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", schedule.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      type="button"
    >
      {thumbnail ? (
        thumbnail.mimeType.startsWith("video/") ? (
          <span className="calendar-video-thumb">视频</span>
        ) : (
          <img alt="" src={thumbnail.fileUrl} />
        )
      ) : null}
      <span>
        <strong>{formatTime(scheduledAt)}</strong>
        {schedule.postVariant.post.title || schedule.postVariant.text}
      </span>
    </button>
  );
}
