/**
 * Help share windows (docs/api-contracts-trip.md §4.12 `start_help_share`, `extend_help_share`):
 * one hour by default, +1 h per extend, never more than three hours ahead of now, so a forgotten
 * share always ends by itself. An SOS share has no end until the incident resolves.
 */
export const HELP_SHARE_TTL_MIN = 60;
export const HELP_SHARE_EXTEND_MIN = 60;
export const HELP_SHARE_MAX_AHEAD_MIN = 180;
/** Sender quick-text and thread limits. */
export const SOS_TEXT_MAX = 280;
export const SOS_MESSAGE_MAX = 500;
export const SOS_HEALTH_NOTES_MAX = 1000;
/** Crew SOS sent per sender per day before the app asks "are you sure?" first. */
export const SOS_DAILY_CONFIRM_AFTER = 3;
/** Without a responder after this long, the crew is pushed again and the sender prompted. */
export const SOS_ESCALATE_AFTER_S = 120;
/** How often responders' walking ETAs are recounted while they are on their way. */
export const SOS_ETA_EVERY_S = 60;
/** A responder this close to the sender has arrived. */
export const SOS_ARRIVED_WITHIN_M = 50;
/** The model's summary is dropped (the sender's own words stand) after this long. */
export const SOS_SUMMARY_TIMEOUT_MS = 3000;
/** Default staleness limit for a queued SOS when ops config is unreadable. */
export const SOS_STALE_AFTER_MIN_DEFAULT = 10;

const MINUTE = 60_000;

/** The end of a new Help share opened at `now`. */
export function helpShareEnd(now: Date, ttlMin: number = HELP_SHARE_TTL_MIN): Date {
  const ttl = Math.min(Math.max(ttlMin, 1), HELP_SHARE_MAX_AHEAD_MIN);
  return new Date(now.getTime() + ttl * MINUTE);
}

/** The end after one extend: from the later of now and the current end, capped at three hours. */
export function extendedHelpShareEnd(
  currentEnd: Date,
  now: Date,
  addMin: number = HELP_SHARE_EXTEND_MIN,
): Date {
  const from = Math.max(currentEnd.getTime(), now.getTime());
  const cap = now.getTime() + HELP_SHARE_MAX_AHEAD_MIN * MINUTE;
  return new Date(Math.min(from + Math.max(addMin, 1) * MINUTE, cap));
}

/** Milliseconds encoded in a UUIDv7 (its first 48 bits); `null` for any other version. */
export function uuidV7Millis(id: string): number | null {
  const hex = id.replaceAll('-', '');
  if (hex.length !== 32 || hex[12] !== '7') return null;
  const millis = Number.parseInt(hex.slice(0, 12), 16);
  return Number.isFinite(millis) ? millis : null;
}

/** Largest device clock correction the server accepts (a day either way). */
export const MAX_CLOCK_OFFSET_MS = 24 * 60 * MINUTE;

/**
 * How long (ms) a queued SOS waited before it reached the server. The op id's UUIDv7 time and
 * `client_ts` both come from the device clock; the earlier of the two is when the sender pressed
 * SEND. `clockOffsetMs` (server minus device, as the app last measured it from a server response)
 * moves that instant onto the server's clock, so a device clock running behind does not make a
 * fresh SOS look old. A negative age (a clock running ahead) clamps to zero.
 */
export function sosOpAgeMs(
  opId: string,
  clientTs: Date,
  serverNow: Date,
  clockOffsetMs = 0,
): number {
  const fromId = uuidV7Millis(opId);
  const offset = Math.min(Math.max(clockOffsetMs, -MAX_CLOCK_OFFSET_MS), MAX_CLOCK_OFFSET_MS);
  const created = Math.min(fromId ?? clientTs.getTime(), clientTs.getTime()) + offset;
  return Math.max(0, serverNow.getTime() - created);
}

/** Whether a queued SOS waited longer than the limit (minutes) to be allowed to alert the crew. */
export function isSosStale(ageMs: number, staleAfterMin: number): boolean {
  return ageMs > Math.max(1, staleAfterMin) * MINUTE;
}
