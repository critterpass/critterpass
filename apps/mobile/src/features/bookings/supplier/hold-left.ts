/** What is left of a supplier's hold ("4:59", "1:02:03"); null once it ran out. Never rounds up. */
export function remainingLabel(untilMs: number, nowMs: number): string | null {
  const left = Math.floor((untilMs - nowMs) / 1000);
  if (left <= 0) return null;
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  if (minutes >= 60)
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
