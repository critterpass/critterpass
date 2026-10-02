/** Month arithmetic for the booking form's day picker: `YYYY-MM` months, Monday-first weeks. */
const pad = (n: number) => String(n).padStart(2, '0');

/** The month to open on: the picked day's, else the trip's first day's, else this month. */
export function monthOf(value: string, fallback: string | null, today = new Date()): string {
  const from = /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : fallback;
  if (from !== null && /^\d{4}-\d{2}/u.test(from)) return from.slice(0, 7);
  return `${String(today.getUTCFullYear())}-${pad(today.getUTCMonth() + 1)}`;
}

export function shiftMonth(month: string, by: number): string {
  const first = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1),
  );
  return `${String(first.getUTCFullYear())}-${pad(first.getUTCMonth() + 1)}`;
}

/** The month's days in Monday-first weeks, blanks (null) before the first and after the last. */
export function monthWeeks(month: string): (string | null)[][] {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  const first = new Date(Date.UTC(year, index, 1));
  const length = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: (first.getUTCDay() + 6) % 7 }, () => null),
    ...Array.from({ length }, (_, i) => `${month}-${pad(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}
