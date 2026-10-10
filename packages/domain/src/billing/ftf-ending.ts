/**
 * The free first trip ending: three days before a crew's first-trip-free window closes, everyone
 * who would lose its perks hears it once (a governed paywall push, `ftf_ending`), and the app shows
 * the same moment while the window has three days or less to run.
 */

export const FTF_ENDING_LEAD_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
/** A timer that fires a little early or late still counts as on time. */
const SLACK_MS = 60 * 60 * 1000;

/** When the reminder for a window closing at `endsAt` is due. */
export function ftfEndingRemindAt(endsAt: Date): Date {
  return new Date(endsAt.getTime() - FTF_ENDING_LEAD_DAYS * DAY_MS);
}

/**
 * Whether the window is in its last three days at `now`: still open, and closing no later than
 * the lead (with an hour's slack for a timer). A window that moved later is not due yet.
 */
export function ftfEndingDue(endsAt: Date, now: Date): boolean {
  const left = endsAt.getTime() - now.getTime();
  return left > 0 && left <= FTF_ENDING_LEAD_DAYS * DAY_MS + SLACK_MS;
}

/** Whole days left, rounded up ("3 days left" until the last 24 h, then "1"). */
export function ftfDaysLeft(endsAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS));
}
