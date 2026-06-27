"use client";

import { useEffect, useMemo, useState } from "react";
import {
  apiRequest,
  type CalendarSchedule,
  type Workspace
} from "../../lib/api";
import { getChinaDateParts, withChinaTime } from "../../lib/chinaTime";
import {
  addDays,
  startOfMonthGrid,
  startOfWeek
} from "./dateUtils";
import { CalendarToolbar } from "./CalendarToolbar";
import { MonthCalendar } from "./MonthCalendar";
import { ScheduleDetailPanel } from "./ScheduleDetailPanel";
import { WeekCalendar } from "./WeekCalendar";

type CalendarViewMode = "month" | "week";

type ContentCalendarProps = {
  token: string;
  workspaces: Workspace[];
};

export function ContentCalendar({ token, workspaces }: ContentCalendarProps) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [view, setView] = useState<CalendarViewMode>("month");
  const [cursor, setCursor] = useState(new Date());
  const [schedules, setSchedules] = useState<CalendarSchedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<CalendarSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "month") {
      const from = startOfMonthGrid(cursor);
      return {
        from,
        to: addDays(from, 42)
      };
    }

    const from = startOfWeek(cursor);
    return {
      from,
      to: addDays(from, 7)
    };
  }, [cursor, view]);
  const rangeKey = `${range.from.toISOString()}:${range.to.toISOString()}`;

  async function loadSchedules() {
    if (!workspaceId) {
      return;
    }

    setError(null);
    const query = new URLSearchParams({
      from: range.from.toISOString(),
      to: range.to.toISOString()
    });

    try {
      const response = await apiRequest<CalendarSchedule[]>(
        `/workspaces/${workspaceId}/schedules?${query.toString()}`,
        { token }
      );
      setSchedules(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法加载日历");
    }
  }

  useEffect(() => {
    loadSchedules();
  }, [workspaceId, rangeKey]);

  async function reschedule(scheduleId: string, targetDate: Date, mode: "day" | "hour") {
    const schedule = schedules.find((item) => item.id === scheduleId);

    if (!schedule || schedule.status !== "scheduled") {
      return;
    }

    const previous = new Date(schedule.scheduledAt);
    const previousParts = getChinaDateParts(previous);
    let next = new Date(targetDate);

    if (mode === "day") {
      next = withChinaTime(targetDate, previousParts.hour, previousParts.minute);
    }

    if (next.getTime() <= Date.now()) {
      setError("不能把内容移动到过去时间");
      return;
    }

    setError(null);

    try {
      const updated = await apiRequest<CalendarSchedule>(
        `/workspaces/${workspaceId}/schedules/${scheduleId}`,
        {
          method: "PATCH",
          token,
          body: {
            scheduledAt: next.toISOString()
          }
        }
      );

      setSchedules((current) =>
        current.map((item) => (item.id === scheduleId ? updated : item))
      );

      if (selectedSchedule?.id === scheduleId) {
        setSelectedSchedule(updated);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法修改发布时间");
    }
  }

  return (
    <div className="calendar-layout">
      <main className="calendar-main">
        <CalendarToolbar
          cursor={cursor}
          onCursorChange={setCursor}
          onViewChange={setView}
          onWorkspaceChange={setWorkspaceId}
          view={view}
          workspaceId={workspaceId}
          workspaces={workspaces}
        />

        {error ? <p className="error">{error}</p> : null}

        {view === "month" ? (
          <MonthCalendar
            cursor={cursor}
            onDropSchedule={reschedule}
            onSelectSchedule={setSelectedSchedule}
            schedules={schedules}
          />
        ) : (
          <WeekCalendar
            cursor={cursor}
            onDropSchedule={reschedule}
            onSelectSchedule={setSelectedSchedule}
            schedules={schedules}
          />
        )}
      </main>

      <ScheduleDetailPanel onClose={() => setSelectedSchedule(null)} schedule={selectedSchedule} />
    </div>
  );
}
