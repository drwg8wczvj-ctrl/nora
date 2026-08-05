export function padTime(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${padTime(date.getMonth() + 1)}-${padTime(date.getDate())}`;
}

export function formatTaskTime(hour: number, minute = 0): string {
  return `${padTime(hour)}:${padTime(minute)}`;
}

export function addCalendarDays(dateString: string, days: number): Date {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date;
}

export function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}
