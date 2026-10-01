/**
 * Real launch countdown, shown only once a `LAUNCH_AT` date is configured (founder decision: the
 * design's "GATE OPENS IN" timer stays hidden behind a static "BOARDING SOON" badge until then).
 */
import { fill } from './page-strings';

/** `pattern` is the page's own wording with `{days}`, `{hours}`, `{minutes}` and `{seconds}`. */
export function formatRemaining(ms: number, pattern: string): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return fill(pattern, { days, hours, minutes, seconds });
}

/** Starts a live d/h/m/s countdown on `elements` toward `launchAt`; returns a stop function. Does
 * nothing (and returns a no-op) when `launchAt` is missing, unparsable, or already in the past. */
export function startCountdown(
  elements: readonly Element[],
  launchAt: string | null,
  strings: { readonly countdown: string; readonly boardingNow: string },
): () => void {
  if (!launchAt) return () => {};
  const target = new Date(launchAt).getTime();
  if (!Number.isFinite(target) || target <= Date.now()) return () => {};

  function tick(): void {
    const remaining = target - Date.now();
    const label =
      remaining > 0 ? formatRemaining(remaining, strings.countdown) : strings.boardingNow;
    for (const el of elements) el.textContent = label;
  }

  tick();
  const interval = setInterval(tick, 1000);
  return () => clearInterval(interval);
}
