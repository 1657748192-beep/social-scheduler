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
          thumbnail.thumbnailUrl ? <img alt="" src={thumbnail.thumbnailUrl} /> : <span className="calendar-video-thumb">视频</span>
        ) : (
          <img alt="" src={thumbnail.thumbnailUrl ?? thumbnail.fileUrl} />
        )
      ) : null}
      <span>
        <strong>{formatTime(scheduledAt)}</strong>
        {schedule.postVariant.post.title || schedule.postVariant.text}
        {schedule.postVariant.socialAccount ? <small>{schedule.postVariant.socialAccount.displayName}</small> : null}
      </span>
    </button>
  );
}
