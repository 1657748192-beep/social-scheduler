export const APP_TIME_ZONE_LABEL = "中国时间 UTC+8";

const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

export type ChinaDateParts = {
  year: number;
  month: number;
  date: number;
  hour: number;
  minute: number;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function getChinaDateParts(date: Date): ChinaDateParts {
  const shifted = new Date(date.getTime() + CHINA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
}

export function fromChinaDateParts(
  year: number,
  month: number,
  date: number,
  hour = 0,
  minute = 0
) {
  return new Date(Date.UTC(year, month, date, hour, minute, 0, 0) - CHINA_OFFSET_MS);
}

export function chinaLocalInputToISOString(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return new Date(value).toISOString();
  }

  const [, year, month, date, hour, minute] = match;
  return fromChinaDateParts(
    Number(year),
    Number(month) - 1,
    Number(date),
    Number(hour),
    Number(minute)
  ).toISOString();
}

export function toChinaDatetimeLocalValue(date: Date) {
  const parts = getChinaDateParts(date);
  return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.date)}T${pad(parts.hour)}:${pad(
    parts.minute
  )}`;
}

export function formatChinaDateKey(date: Date) {
  const parts = getChinaDateParts(date);
  return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.date)}`;
}

export function formatChinaTime(date: Date) {
  const parts = getChinaDateParts(date);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatChinaDate(date: Date) {
  const parts = getChinaDateParts(date);
  return `${parts.year}/${parts.month + 1}/${parts.date}`;
}

export function formatChinaDateTime(date: Date) {
  return `${formatChinaDate(date)} ${formatChinaTime(date)}`;
}

export function getChinaHour(date: Date) {
  return getChinaDateParts(date).hour;
}

export function withChinaTime(date: Date, hour: number, minute: number) {
  const parts = getChinaDateParts(date);
  return fromChinaDateParts(parts.year, parts.month, parts.date, hour, minute);
}
