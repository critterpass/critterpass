/* eslint-disable lingui/no-unlocalized-strings -- ISO date parts, never copy. */
/** Days in a trip from its local start and end dates, both included; 0 until both are set. */
export function tripDays(start: string | null, end: string | null): number {
  if (start === null || end === null) return 0;
  const ms =
    Date.parse(`${end.slice(0, 10)}T00:00:00Z`) - Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) || ms < 0 ? 0 : Math.round(ms / 86_400_000) + 1;
}
