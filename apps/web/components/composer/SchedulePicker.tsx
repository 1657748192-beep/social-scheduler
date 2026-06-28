"use client";

import { APP_TIME_ZONE_LABEL, toChinaDatetimeLocalValue } from "../../lib/chinaTime";

type SchedulePickerProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
  return (
    <section className="composer-panel">
      <p className="section-kicker">发布时间</p>
      <h2>定时发布</h2>
      <label className="field">
        <span>发布时间</span>
        <input
          min={toChinaDatetimeLocalValue(new Date())}
          onChange={(event) => onChange(event.target.value)}
          type="datetime-local"
          value={value}
        />
      </label>
      <p className="muted">按 {APP_TIME_ZONE_LABEL} 保存；留空则保存为草稿。</p>
    </section>
  );
}
