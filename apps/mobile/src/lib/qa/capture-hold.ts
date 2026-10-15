/**
 * Captures only: a link can ask the app to hold a moment long enough to be shot. On a runner
 * without a GPU a single tap takes longer than a toast's four seconds or a zoom's half second
 * (Maestro dumps the hierarchy until the screen settles), so both came and went before the flow
 * could shoot them.
 *
 * - `qaToastHold=<ms>`: the toasts sent in the next two minutes stay up that long (the flow taps
 *   the toast away once shot);
 * - `qaZoomMs=<ms>`: the next card-to-page zoom in those two minutes runs that long, also where
 *   the phone reduces motion.
 *
 * Nothing else reads them, and outside development and e2e builds they never apply.
 */
import { UI_QA_ENABLED } from './ui-qa';

/** How long after the link its hold applies. */
const WINDOW_MS = 120_000;

interface Hold {
  readonly ms: number;
  readonly until: number;
}

let toastHold: Hold | null = null;
let zoomHold: Hold | null = null;

function holdIn(url: string, name: string, now: number): Hold | null {
  const match = new RegExp(`[?&]${name}=(\\d+)`).exec(url);
  return match?.[1] === undefined ? null : { ms: Number(match[1]), until: now + WINDOW_MS };
}

/** Reads a link the app was handed; one carrying a hold starts it. */
export function readCaptureHoldLink(url: string, now: number = Date.now()): void {
  toastHold = holdIn(url, 'qaToastHold', now) ?? toastHold;
  zoomHold = holdIn(url, 'qaZoomMs', now) ?? zoomHold;
}

/** How long a toast stays: its own hold, or the capture's while one applies. */
export function qaToastHold(holdMs: number, now: number = Date.now(), enabled = UI_QA_ENABLED) {
  if (!enabled || toastHold === null) return holdMs;
  if (now > toastHold.until) {
    toastHold = null;
    return holdMs;
  }
  return Math.max(holdMs, toastHold.ms);
}

/**
 * Whether a capture asked for the next zoom: it then runs even where the phone reduces motion (an
 * Android emulator with its animations off reads as Reduce Motion, which skipped the zoom).
 */
export function qaZoomPending(now: number = Date.now(), enabled = UI_QA_ENABLED): boolean {
  return enabled && zoomHold !== null && now <= zoomHold.until;
}

/** How long a zoom runs: its own duration, or the capture's for the next one. */
export function qaZoomMs(durationMs: number, now: number = Date.now(), enabled = UI_QA_ENABLED) {
  if (!enabled || zoomHold === null) return durationMs;
  const hold = zoomHold;
  zoomHold = null;
  return now > hold.until ? durationMs : Math.max(durationMs, hold.ms);
}
