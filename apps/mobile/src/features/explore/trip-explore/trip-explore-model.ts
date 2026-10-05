/**
 * Where each of the guide's picks stands for the trip (in a day of the plan, in the crew's Ideas,
 * or one tap from being saved) and which free window the gaps card offers: the next one still
 * ahead, in the trip's own time zone.
 */
import type { Gap } from '@cp/domain';

export type PickState =
  | { readonly kind: 'inDay'; readonly dayNo: number }
  | { readonly kind: 'saved' }
  | { readonly kind: 'add' };

/**
 * A place in the plan shows its day (placing an idea takes it off Ideas); a place anyone in the
 * crew saved shows ♥ SAVED; anything else gets the one-tap +.
 */
export function pickState(
  poiId: string,
  planned: ReadonlyMap<string, { readonly dayNo: number }>,
  ideaPlaces: ReadonlySet<string>,
): PickState {
  const at = planned.get(poiId);
  if (at !== undefined) return { kind: 'inDay', dayNo: at.dayNo };
  return ideaPlaces.has(poiId) ? { kind: 'saved' } : { kind: 'add' };
}

/** A gap with its day's local date. */
export interface DatedGap {
  readonly gap: Gap;
  readonly date: string;
}

function minutesOf(clock: string): number {
  const [hours, minutes] = clock.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/**
 * The first gap still ahead of `now` (the trip's local date and minute of the day): a later day,
 * or today's gap that has not started yet. Earliest first; with several at once, the one more of
 * the crew are free for.
 */
export function nextGap<G extends DatedGap>(
  gaps: readonly G[],
  now: { readonly date: string; readonly minute: number },
): G | null {
  const ahead = gaps.filter(
    (entry) =>
      entry.date > now.date || (entry.date === now.date && minutesOf(entry.gap.from) > now.minute),
  );
  ahead.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      minutesOf(a.gap.from) - minutesOf(b.gap.from) ||
      b.gap.who_free.length - a.gap.who_free.length,
  );
  return ahead[0] ?? null;
}

/** The swipe card's pill: join the trip's open session, or start one when there is none. */
export type SwipeLive = { readonly kind: 'start' } | { readonly kind: 'join' };

export function swipeLive(sessionOpen: boolean): SwipeLive {
  return { kind: sessionOpen ? 'join' : 'start' };
}

/** The kinds of place with any places, fullest first, from per-category counts. */
export function kindCounts<G extends string>(
  counts: readonly { readonly category: string; readonly n: number }[],
  groupOf: (category: string) => G | null,
): { readonly group: G; readonly count: number }[] {
  const byGroup = new Map<G, number>();
  for (const row of counts) {
    const group = groupOf(row.category);
    if (group !== null && row.n > 0) byGroup.set(group, (byGroup.get(group) ?? 0) + row.n);
  }
  return [...byGroup.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group));
}
