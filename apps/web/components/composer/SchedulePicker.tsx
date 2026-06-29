"use client";

import { BeijingDateTimePicker } from "../BeijingDateTimePicker";
import { APP_TIME_ZONE_LABEL, toChinaDatetimeLocalValue } from "../../lib/chinaTime";

type SchedulePickerProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
  const minDateTime = toChinaDatetimeLocalValue(new Date());

  return (
    <section className="composer-panel">
      <p className="section-kicker">发布时间</p>
      <h2>定时发布</h2>
      <label className="field">
        <span>北京时间</span>
        <BeijingDateTimePicker min={minDateTime} onChange={onChange} value={value} />
      </label>
      <p className="muted">按 {APP_TIME_ZONE_LABEL} 保存，使用 24 小时制；留空则保存为草稿。</p>
    </section>
  );
}
