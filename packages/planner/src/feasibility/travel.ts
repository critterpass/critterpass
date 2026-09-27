/**
 * Per-person timelines: for everyone, consecutive items must not overlap and the gap between them
 * must cover the injected travel time. A leg shared by several people is reported once, with all
 * of their uids. Slack under the tight threshold is returned separately (fits, but only just).
 */
import { type FeasibilityItem, type TravelMinutes, type Violation } from './types';

const MINUTE = 60_000;

export interface TimelineCheck {
  readonly violations: readonly Violation[];
  /** Items followed by a leg with less than the tight threshold of slack. */
  readonly tight: ReadonlySet<string>;
}

function attendeesOf(item: FeasibilityItem, members: readonly string[]): readonly string[] {
  return item.attendeeIds && item.attendeeIds.length > 0 ? item.attendeeIds : members;
}

export function timelineViolations(
  items: readonly FeasibilityItem[],
  members: readonly string[],
  travel: TravelMinutes,
  tightSlackMin: number,
): TimelineCheck {
  const legs = new Map<string, { a: FeasibilityItem; b: FeasibilityItem; uids: string[] }>();
  const everyone = new Set([...members, ...items.flatMap((i) => i.attendeeIds ?? [])]);
  for (const uid of [...everyone].sort()) {
    const mine = items
      .filter((item) => attendeesOf(item, members).includes(uid))
      .sort(
        (x, y) => x.startsAt.getTime() - y.startsAt.getTime() || (x.stableId < y.stableId ? -1 : 1),
      );
    for (let i = 1; i < mine.length; i += 1) {
      const a = mine[i - 1] as FeasibilityItem;
      const b = mine[i] as FeasibilityItem;
      const key = `${a.stableId}>${b.stableId}`;
      const leg = legs.get(key) ?? { a, b, uids: [] };
      leg.uids.push(uid);
      legs.set(key, leg);
    }
  }
  const violations: Violation[] = [];
  const tight = new Set<string>();
  for (const { a, b, uids } of legs.values()) {
    const gap = (b.startsAt.getTime() - a.endsAt.getTime()) / MINUTE;
    if (gap < 0) {
      violations.push({
        code: 'OVERLAP',
        stableId: b.stableId,
        relatedId: a.stableId,
        uids,
        minutes: -gap,
      });
      continue;
    }
    const needed = travel(a.stableId, b.stableId);
    if (needed === null) continue;
    if (needed > gap) {
      violations.push({
        code: 'TRAVEL_TOO_LONG',
        stableId: b.stableId,
        relatedId: a.stableId,
        uids,
        minutes: needed - gap,
      });
    } else if (gap - needed < tightSlackMin) {
      tight.add(b.stableId);
    }
  }
  return { violations, tight };
}
