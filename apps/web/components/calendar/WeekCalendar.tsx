"use client";

import type { CalendarSchedule } from "../../lib/api";
import { addDays, formatDateKey, startOfWeek } from "./dateUtils";
import { CalendarEventItem } from "./CalendarEventItem";

type WeekCalendarProps = {
  cursor: Date;
  schedules: CalendarSchedule[];
  onDropSchedule: (scheduleId: string, targetDate: Date, mode: "day" | "hour") => void;
  onSelectSchedule: (schedule: CalendarSchedule) => void;
};

export function WeekCalendar({
  cursor,
  schedules,
  onDropSchedule,
  onSelectSchedule
}: WeekCalendarProps) {
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  function schedulesFor(day: Date, hour: number) {
    return schedules.filter((schedule) => {
      const scheduledAt = new Date(schedule.scheduledAt);
      return formatDateKey(scheduledAt) === formatDateKey(day) && scheduledAt.getHours() === hour;
    });
  }

  return (
    <section className="calendar-week">
      <div className="calendar-hour-header" />
      {days.map((day) => (
        <div className="calendar-week-header" key={formatDateKey(day)}>
          <strong>{day.toLocaleDateString("zh-CN", { weekday: "short" })}</strong>
          <span>{day.getDate()}</span>
        </div>
      ))}

      {hours.map((hour) => (
        <div className="calendar-week-row" key={hour}>
          <div className="calendar-hour-label">{String(hour).padStart(2, "0")}:00</div>
          {days.map((day) => {
            const target = new Date(day);
            target.setHours(hour, 0, 0, 0);
            return (
              <div
                className="calendar-hour-cell"
                key={`${formatDateKey(day)}-${hour}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const scheduleId = event.dataTransfer.getData("text/plain");
                  if (scheduleId) {
                    onDropSchedule(scheduleId, target, "hour");
                  }
                }}
              >
                {schedulesFor(day, hour).map((schedule) => (
                  <CalendarEventItem
                    key={schedule.id}
                    onClick={onSelectSchedule}
                    schedule={schedule}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
