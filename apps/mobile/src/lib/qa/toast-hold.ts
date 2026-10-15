/**
 * Captures only: a link carrying `qaToastHold=<ms>` keeps the toasts sent in the next two minutes
 * up for that long. On a runner without a GPU a single tap takes longer than a toast's four
 * seconds (Maestro dumps the hierarchy until it settles), so a toast came and went before the flow
 * could shoot it. The flow taps the toast away once it is shot. Nothing else in the app reads it,
 * and outside development and e2e builds it never applies.
 */
import { UI_QA_ENABLED } from './ui-qa';

/** How long after the link its hold applies. */
const WINDOW_MS = 120_000;

let hold: { readonly ms: number; readonly until: number } | null = null;

/** Reads a link the app was handed; one with `qaToastHold=<ms>` starts the hold. */
export function readQaToastHoldLink(url: string, now: number = Date.now()): void {
  const match = /[?&]qaToastHold=(\d+)/.exec(url);
  if (match?.[1] === undefined) return;
  hold = { ms: Number(match[1]), until: now + WINDOW_MS };
}

/** How long a toast stays: its own hold, or the capture's while one applies. */
export function qaToastHold(holdMs: number, now: number = Date.now(), enabled = UI_QA_ENABLED) {
  if (!enabled || hold === null) return holdMs;
  if (now > hold.until) {
    hold = null;
    return holdMs;
  }
  return Math.max(holdMs, hold.ms);
}
