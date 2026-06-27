import {
  formatChinaDate,
  formatChinaDateKey,
  formatChinaDateTime,
  formatChinaTime,
  fromChinaDateParts,
  getChinaDateParts
} from "../../lib/chinaTime";

export function startOfDay(date: Date) {
  const parts = getChinaDateParts(date);
  return fromChinaDateParts(parts.year, parts.month, parts.date);
}

export function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const parts = getChinaDateParts(start);
  const dayOfWeek = new Date(Date.UTC(parts.year, parts.month, parts.date)).getUTCDay();
  return fromChinaDateParts(parts.year, parts.month, parts.date - dayOfWeek);
}

export function startOfMonthGrid(date: Date) {
  const parts = getChinaDateParts(date);
  return startOfWeek(fromChinaDateParts(parts.year, parts.month, 1));
}

export function addDays(date: Date, days: number) {
  const parts = getChinaDateParts(date);
  return fromChinaDateParts(parts.year, parts.month, parts.date + days, parts.hour, parts.minute);
}

export function addMonths(date: Date, months: number) {
  const parts = getChinaDateParts(date);
  return fromChinaDateParts(parts.year, parts.month + months, 1);
}

export function formatDateKey(date: Date) {
  return formatChinaDateKey(date);
}

export function sameMonth(left: Date, right: Date) {
  const leftParts = getChinaDateParts(left);
  const rightParts = getChinaDateParts(right);
  return leftParts.year === rightParts.year && leftParts.month === rightParts.month;
}

export function formatMonthTitle(date: Date) {
  const parts = getChinaDateParts(date);
  return `${parts.year}年${parts.month + 1}月`;
}

export function formatTime(date: Date) {
  return formatChinaTime(date);
}

export function formatDateTime(date: Date) {
  return formatChinaDateTime(date);
}

export function formatDate(date: Date) {
  return formatChinaDate(date);
}

export function getDayNumber(date: Date) {
  return getChinaDateParts(date).date;
}

export function getWeekdayShort(date: Date) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
    new Date(Date.UTC(
      getChinaDateParts(date).year,
      getChinaDateParts(date).month,
      getChinaDateParts(date).date
    )).getUTCDay()
  ];
}
