"use client";

type BeijingDateTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  min?: string;
  required?: boolean;
};

const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

function splitDateTime(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return {
      date: "",
      hour: "00",
      minute: "00"
    };
  }

  return {
    date: match[1],
    hour: match[2],
    minute: match[3]
  };
}

function combineDateTime(date: string, hour: string, minute: string) {
  return date ? `${date}T${hour}:${minute}` : "";
}

export function BeijingDateTimePicker({
  value,
  onChange,
  name,
  min,
  required = false
}: BeijingDateTimePickerProps) {
  const current = splitDateTime(value);
  const minDate = min ? splitDateTime(min).date : undefined;

  return (
    <div className="beijing-datetime-picker">
      {name ? <input name={name} type="hidden" value={value} /> : null}
      <input
        aria-label="发布日期"
        min={minDate}
        onChange={(event) => {
          onChange(combineDateTime(event.target.value, current.hour, current.minute));
        }}
        required={required}
        type="date"
        value={current.date}
      />
      <select
        aria-label="北京时间小时"
        disabled={!current.date}
        onChange={(event) => {
          onChange(combineDateTime(current.date, event.target.value, current.minute));
        }}
        value={current.hour}
      >
        {hourOptions.map((hour) => (
          <option key={hour} value={hour}>
            {hour}
          </option>
        ))}
      </select>
      <span className="beijing-datetime-separator">:</span>
      <select
        aria-label="北京时间分钟"
        disabled={!current.date}
        onChange={(event) => {
          onChange(combineDateTime(current.date, current.hour, event.target.value));
        }}
        value={current.minute}
      >
        {minuteOptions.map((minute) => (
          <option key={minute} value={minute}>
            {minute}
          </option>
        ))}
      </select>
    </div>
  );
}
