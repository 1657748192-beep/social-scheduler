"use client";

type SchedulePickerProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
  return (
    <section className="composer-panel">
      <h2>Schedule</h2>
      <label className="field">
        <span>Publish time</span>
        <input
          min={new Date().toISOString().slice(0, 16)}
          onChange={(event) => onChange(event.target.value)}
          type="datetime-local"
          value={value}
        />
      </label>
      <p className="muted">Leave empty to save as a draft.</p>
    </section>
  );
}
