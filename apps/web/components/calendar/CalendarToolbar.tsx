"use client";

import type { Workspace } from "../../lib/api";
import { addDays, addMonths, formatDate, formatMonthTitle, startOfWeek } from "./dateUtils";
import { useLanguage } from "../LanguageProvider";

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
  const { t } = useLanguage();
  const weekStart = startOfWeek(cursor);
  const weekEnd = addDays(weekStart, 6);
  const title =
    view === "month"
      ? formatMonthTitle(cursor)
      : `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;

  function move(direction: -1 | 1) {
    onCursorChange(view === "month" ? addMonths(cursor, direction) : addDays(cursor, direction * 7));
  }

  return (
    <section className="calendar-toolbar">
      <div>
        <p className="section-kicker">{t("内容排期", "Content calendar")}</p>
        <h1>{title}</h1>
        <p className="muted">{t("拖动已排程内容，可以调整到新的日期或小时。", "Drag scheduled content to move it to a new date or hour.")}</p>
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
            {t("月视图", "Month")}
          </button>
          <button
            className={view === "week" ? "active" : ""}
            onClick={() => onViewChange("week")}
            type="button"
          >
            {t("周视图", "Week")}
          </button>
        </div>
        <button className="button secondary" onClick={() => move(-1)} type="button">
          {t("上一页", "Previous")}
        </button>
        <button className="button secondary" onClick={() => onCursorChange(new Date())} type="button">
          {t("今天", "Today")}
        </button>
        <button className="button secondary" onClick={() => move(1)} type="button">
          {t("下一页", "Next")}
        </button>
      </div>
    </section>
  );
}
