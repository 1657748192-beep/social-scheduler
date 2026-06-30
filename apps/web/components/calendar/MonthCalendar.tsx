"use client";

import { useState } from "react";
import type { CalendarSchedule } from "../../lib/api";
import {
  addDays,
  formatDate,
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

function sortSchedules(schedules: CalendarSchedule[]) {
  return [...schedules].sort(
    (left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
  );
}

export function MonthCalendar({
  cursor,
  schedules,
  onDropSchedule,
  onSelectSchedule
}: MonthCalendarProps) {
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const gridStart = startOfMonthGrid(cursor);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const grouped = new Map<string, CalendarSchedule[]>();

  for (const schedule of schedules) {
    const key = formatDateKey(new Date(schedule.scheduledAt));
    grouped.set(key, [...(grouped.get(key) ?? []), schedule]);
  }

  const expandedDate = expandedDayKey
    ? days.find((day) => formatDateKey(day) === expandedDayKey) ?? null
    : null;
  const expandedSchedules = expandedDayKey ? sortSchedules(grouped.get(expandedDayKey) ?? []) : [];

  return (
    <>
      <section className="calendar-month">
        {["周日", "周一", "周二", "周三", "周四", "周五", "周六"].map((day) => (
          <div className="calendar-weekday" key={day}>
            {day}
          </div>
        ))}

        {days.map((day) => {
          const key = formatDateKey(day);
          const daySchedules = sortSchedules(grouped.get(key) ?? []);

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
                  <button
                    className="calendar-more"
                    onClick={(event) => {
                      event.stopPropagation();
                      setExpandedDayKey(key);
                    }}
                    type="button"
                  >
                    +{daySchedules.length - 4} 更多
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>

      {expandedDayKey ? (
        <div
          className="calendar-day-modal-backdrop"
          onClick={() => setExpandedDayKey(null)}
          role="presentation"
        >
          <section
            aria-label="当天全部排程"
            aria-modal="true"
            className="calendar-day-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="calendar-day-modal-header">
              <div>
                <p className="section-kicker">当天排程</p>
                <h2>{expandedDate ? formatDate(expandedDate) : "当天内容"}</h2>
                <span>{expandedSchedules.length} 条内容</span>
              </div>
              <button
                aria-label="关闭当天排程"
                onClick={() => setExpandedDayKey(null)}
                type="button"
              >
                ×
              </button>
            </header>

            <div className="calendar-day-modal-list">
              {expandedSchedules.map((schedule) => (
                <CalendarEventItem
                  key={schedule.id}
                  onClick={(selected) => {
                    setExpandedDayKey(null);
                    onSelectSchedule(selected);
                  }}
                  schedule={schedule}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
