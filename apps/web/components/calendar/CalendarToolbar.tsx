"use client";

import type { Workspace } from "../../lib/api";
import { formatMonthTitle, startOfWeek } from "./dateUtils";

type CalendarViewMode = "month" | "week";

type CalendarToolbarProps = {
  cursor: Date;
  view: CalendarViewMode;
  workspaces: Workspace[];
  workspaceId: string;
  onCursorChange: (date: Date) => void;
  onViewChange: (view: CalendarViewMode) => void;
  onWorkspaceChange: (workspaceId: string) => void;
};

export function CalendarToolbar({
  cursor,
  view,
  workspaces,
  workspaceId,
  onCursorChange,
  onViewChange,
  onWorkspaceChange
}: CalendarToolbarProps) {
  const weekStart = startOfWeek(cursor);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const title =
    view === "month"
      ? formatMonthTitle(cursor)
      : `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;

  function move(direction: -1 | 1) {
    const next = new Date(cursor);
    if (view === "month") {
      next.setMonth(next.getMonth() + direction);
    } else {
      next.setDate(next.getDate() + direction * 7);
    }
    onCursorChange(next);
  }

  return (
    <section className="calendar-toolbar">
      <div>
        <h1>{title}</h1>
        <p className="muted">Drag scheduled content to a new day or hour.</p>
      </div>

      <div className="calendar-controls">
        <select value={workspaceId} onChange={(event) => onWorkspaceChange(event.target.value)}>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <div className="segmented">
          <button
            className={view === "month" ? "active" : ""}
            onClick={() => onViewChange("month")}
            type="button"
          >
            Month
          </button>
          <button
            className={view === "week" ? "active" : ""}
            onClick={() => onViewChange("week")}
            type="button"
          >
            Week
          </button>
        </div>
        <button className="button secondary" onClick={() => move(-1)} type="button">
          Prev
        </button>
        <button className="button secondary" onClick={() => onCursorChange(new Date())} type="button">
          Today
        </button>
        <button className="button secondary" onClick={() => move(1)} type="button">
          Next
        </button>
      </div>
    </section>
  );
}
