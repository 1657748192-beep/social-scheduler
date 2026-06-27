"use client";

import type { CalendarSchedule } from "../../lib/api";
import {
  addDays,
  formatDateKey,
  getDayNumber,
  sameMonth,
  startOfMonthGrid
} from "./dateUtils";
import { CalendarEventItem } from "./CalendarEventItem";

type MonthCalendarProps = {
  cursor: Date;
  schedules: CalendarSchedule[];
  onDropSchedule: (scheduleId: string, targetDate: Date, mode: "day" | "hour") => void;
  onSelectSchedule: (schedule: CalendarSchedule) => void;
};

export function MonthCalendar({
  cursor,
  schedules,
  onDropSchedule,
  onSelectSchedule
}: MonthCalendarProps) {
  const gridStart = startOfMonthGrid(cursor);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const grouped = new Map<string, CalendarSchedule[]>();

  for (const schedule of schedules) {
    const key = formatDateKey(new Date(schedule.scheduledAt));
    grouped.set(key, [...(grouped.get(key) ?? []), schedule]);
  }

  return (
    <section className="calendar-month">
      {["周日", "周一", "周二", "周三", "周四", "周五", "周六"].map((day) => (
        <div className="calendar-weekday" key={day}>
          {day}
        </div>
      ))}

      {days.map((day) => {
        const key = formatDateKey(day);
        const daySchedules = grouped.get(key) ?? [];
        return (
          <div
            className={`calendar-day ${sameMonth(day, cursor) ? "" : "outside"}`}
            key={key}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const scheduleId = event.dataTransfer.getData("text/plain");
              if (scheduleId) {
                onDropSchedule(scheduleId, day, "day");
              }
            }}
          >
            <div className="calendar-day-number">{getDayNumber(day)}</div>
            <div className="calendar-day-events">
              {daySchedules.slice(0, 4).map((schedule) => (
                <CalendarEventItem
                  key={schedule.id}
                  onClick={onSelectSchedule}
                  schedule={schedule}
                />
              ))}
              {daySchedules.length > 4 ? (
                <button className="calendar-more" type="button">
                  +{daySchedules.length - 4} 更多
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
