/**
 * Chronotype windows: an early bird booked into something that runs past 22:00, or a night owl
 * into something that starts before 09:00 (local), is a soft violation the draft should avoid.
 */
import { localMinute } from './grid';
import {
  type ChronotypeKind,
  type ChronotypeWindows,
  type FeasibilityItem,
  type Violation,
} from './types';

const DAY_MS = 86_400_000;

export function chronotypeViolations(
  items: readonly FeasibilityItem[],
  members: readonly string[],
  chronotypes: Readonly<Record<string, ChronotypeKind>>,
  windows: ChronotypeWindows,
): Violation[] {
  const out: Violation[] = [];
  for (const item of items) {
    const attendees = item.attendeeIds && item.attendeeIds.length > 0 ? item.attendeeIds : members;
    const startMin = localMinute(item.startsAt, item.tz);
    const endMin = localMinute(item.endsAt, item.tz);
    const crossesMidnight =
      endMin < startMin || item.endsAt.getTime() - item.startsAt.getTime() >= DAY_MS;
    const uids = attendees.filter((uid) => {
      const kind = chronotypes[uid];
      if (kind === 'early_bird') return crossesMidnight || endMin > windows.earlyBirdEndMin;
      if (kind === 'night_owl') return startMin < windows.nightOwlStartMin;
      return false;
    });
    if (uids.length > 0) out.push({ code: 'CHRONOTYPE', stableId: item.stableId, uids });
  }
  return out;
}
