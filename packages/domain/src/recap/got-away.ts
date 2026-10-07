/**
 * The one that got away (3m-7): among the destination's epic and legendary forms that could spawn
 * during the trip and that nobody on it found, the one the crew came closest to. Sightings (an
 * encounter that ended without a befriend) rank first, then the destination's own critter (Chà Vá
 * in Đà Nẵng) over the rest of its country's set, then legendary over epic, then the critter's
 * number, then the form id, so the pick is stable. A seasonal form also carries its next
 * window after the trip, for the "comes back in May" line and the reminder.
 */
import { nextWindowSpan, windowOpenOn, type WindowRule } from '../critters/spawn-rules';
import type { RecapGotAway } from './schema';

export interface GotAwayCandidate {
  readonly form_id: string;
  readonly critter_id: string;
  readonly critter_key: string;
  readonly critter_no: number;
  /** A form of the critter whose city the destination is. */
  readonly own: boolean;
  readonly rarity: 'epic' | 'legendary';
  readonly sightings: number;
  readonly wandered_off: number;
  readonly seen_by: readonly string[];
  readonly forms_found: number;
  readonly forms_total: number;
  /** The form's window, when it only spawns in season; null spawns any day. */
  readonly window: WindowRule | null;
}

function addDays(localDate: string, days: number): string {
  return new Date(Date.parse(`${localDate}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Every local date from `start` to `end`, inclusive. */
function tripDates(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let day = start; day <= end && dates.length < 400; day = addDays(day, 1)) dates.push(day);
  return dates;
}

/** The window's next opening after the trip: a window still open past the end counts from its next start. */
function comesBack(window: WindowRule, end: string) {
  const after = addDays(end, 1);
  if (!windowOpenOn(window, after)) return nextWindowSpan(window, after);
  const current = nextWindowSpan(window, after);
  return current === null ? null : nextWindowSpan(window, addDays(current.end, 1));
}

function rank(a: GotAwayCandidate, b: GotAwayCandidate): number {
  if (a.sightings !== b.sightings) return b.sightings - a.sightings;
  if (a.own !== b.own) return a.own ? -1 : 1;
  if (a.rarity !== b.rarity) return a.rarity === 'legendary' ? -1 : 1;
  if (a.critter_no !== b.critter_no) return a.critter_no - b.critter_no;
  return a.form_id < b.form_id ? -1 : a.form_id > b.form_id ? 1 : 0;
}

/** The form that got away from a trip that ran `start`–`end`, or null when nothing did. */
export function selectGotAway(
  candidates: readonly GotAwayCandidate[],
  start: string,
  end: string,
): RecapGotAway | null {
  const dates = tripDates(start, end);
  const open = candidates.filter(
    (candidate) =>
      candidate.window === null ||
      dates.some((date) => windowOpenOn(candidate.window as WindowRule, date)),
  );
  const pick = [...open].sort(rank)[0];
  if (pick === undefined) return null;
  const span = pick.window === null ? null : comesBack(pick.window, end);
  return {
    form_id: pick.form_id,
    critter_id: pick.critter_id,
    critter_key: pick.critter_key,
    rarity: pick.rarity,
    sightings: pick.sightings,
    wandered_off: pick.wandered_off,
    seen_by: [...pick.seen_by].sort(),
    forms_found: pick.forms_found,
    forms_total: pick.forms_total,
    next_window: span === null ? null : { from: span.start, to: span.end },
  };
}
