"use client";

type SchedulePickerProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
  return (
    <section className="composer-panel">
      <h2>定时发布</h2>
      <label className="field">
        <span>发布时间</span>
        <input
          min={new Date().toISOString().slice(0, 16)}
          onChange={(event) => onChange(event.target.value)}
          type="datetime-local"
          value={value}
        />
      </label>
      <p className="muted">留空则保存为草稿。</p>
    </section>
  );
}
