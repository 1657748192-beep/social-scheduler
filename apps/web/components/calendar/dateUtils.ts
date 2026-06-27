export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfWeek(date: Date) {
  const start = startOfDay(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

export function startOfMonthGrid(date: Date) {
  return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export function sameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

export function formatMonthTitle(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
}

export function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatDateTime(date: Date) {
  return `${date.toLocaleDateString()} ${formatTime(date)}`;
}
