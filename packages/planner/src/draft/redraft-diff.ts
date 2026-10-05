/**
 * A redraft as operations on stable item ids. `alignStableIds` first gives the redrafted day the
 * base day's ids wherever it can: the same place keeps its id (a `retime` when its times moved), a
 * new place standing in the time of a dropped one of the same kind takes that one's id (a `swap`),
 * anything else is new (an `add`), and whatever is left of the base day is a `remove`. So a kept
 * redraft replays on the same ids ChangeSets use. A stop the redraft moved to another day keeps its
 * stable id there: its `remove` carries where it went (`after` and `moved_to_day`), so the review
 * says "moved to day 3" and never "taken out".
 */
import type {
  DraftDay,
  DraftItem,
  RedraftChange,
  RedraftChangeOp,
  RedraftItemSnapshot,
} from '@cp/domain';

function overlapMs(a: DraftItem, b: DraftItem): number {
  const start = Math.max(Date.parse(a.starts_at), Date.parse(b.starts_at));
  const end = Math.min(Date.parse(a.ends_at), Date.parse(b.ends_at));
  return end - start;
}

/** The candidate day re-keyed on the base day's stable ids (see the file header). */
export function alignStableIds(base: DraftDay, candidate: DraftDay): DraftDay {
  const free = new Map(base.items.map((item) => [item.stable_id, item]));
  const byPoi = new Map<string, DraftItem>();
  for (const item of base.items) if (item.poi_id !== null) byPoi.set(item.poi_id, item);
  const ids = new Map<number, string>();
  candidate.items.forEach((item, index) => {
    const same = item.poi_id === null ? undefined : byPoi.get(item.poi_id);
    if (same !== undefined && free.has(same.stable_id)) {
      ids.set(index, same.stable_id);
      free.delete(same.stable_id);
    }
  });
  candidate.items.forEach((item, index) => {
    if (ids.has(index)) return;
    const standIn = [...free.values()]
      .filter((old) => old.kind === item.kind && overlapMs(old, item) > 0)
      .sort((a, b) => overlapMs(b, item) - overlapMs(a, item))[0];
    if (standIn === undefined) return;
    ids.set(index, standIn.stable_id);
    free.delete(standIn.stable_id);
  });
  return {
    ...candidate,
    items: candidate.items.map((item, index) => ({
      ...item,
      stable_id: ids.get(index) ?? item.stable_id,
    })),
  };
}

function snapshot(item: DraftItem): RedraftItemSnapshot {
  return {
    poi_id: item.poi_id,
    kind: item.kind,
    starts_at: item.starts_at,
    ends_at: item.ends_at,
    amount_minor: item.amount_minor,
  };
}

function sameTimes(a: DraftItem, b: DraftItem): boolean {
  return (
    Date.parse(a.starts_at) === Date.parse(b.starts_at) &&
    Date.parse(a.ends_at) === Date.parse(b.ends_at)
  );
}

/**
 * Changes from `base` to an aligned `candidate`, in the candidate's order, removals last; `others`
 * are the trip's other days as the redraft left them, where a removed stop may have moved to.
 */
export function redraftDiff(
  base: DraftDay,
  candidate: DraftDay,
  others: readonly DraftDay[] = [],
): RedraftChange[] {
  const before = new Map(base.items.map((item) => [item.stable_id, item]));
  const changes: RedraftChange[] = [];
  const change = (op: RedraftChangeOp, old: DraftItem | null, next: DraftItem | null) => {
    const item = (next ?? old) as DraftItem;
    changes.push({
      op,
      stable_id: item.stable_id,
      before: old === null ? null : snapshot(old),
      after: next === null ? null : snapshot(next),
      reason: next?.note ?? null,
    });
  };
  for (const item of candidate.items) {
    const old = before.get(item.stable_id);
    before.delete(item.stable_id);
    if (old === undefined) change('add', null, item);
    else if (old.poi_id !== item.poi_id) change('swap', old, item);
    else if (!sameTimes(old, item)) change('retime', old, item);
  }
  for (const old of before.values()) {
    const day = others.find(
      (d) => d.day_no !== base.day_no && d.items.some((i) => i.stable_id === old.stable_id),
    );
    const there = day?.items.find((i) => i.stable_id === old.stable_id);
    if (day === undefined || there === undefined) {
      change('remove', old, null);
      continue;
    }
    changes.push({
      op: 'remove',
      stable_id: old.stable_id,
      before: snapshot(old),
      after: snapshot(there),
      reason: there.note ?? null,
      moved_to_day: day.day_no,
    });
  }
  return changes;
}
