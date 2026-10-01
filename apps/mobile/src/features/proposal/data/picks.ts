/**
 * The picks a version highlights (3f-3), joined to the plan they came from: the stop's name, its
 * day and start, and the reason tag the guide gave ("YOU PICKED STREET FOOD"). Before the crew
 * can read the plan itself (a draft is the organiser's), a pick is named by the story slide the
 * guide wrote about it; one with neither is dropped.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';

import type { Highlight, Slide } from './proposal';
import { useLiveRows } from './rows';

export interface Pick {
  readonly itemId: string;
  readonly title: string;
  readonly dayNo: number | null;
  readonly startsAt: string | null;
  readonly tz: string | null;
  readonly category: string | null;
  readonly reasonTag: string;
}

interface ItemRow {
  readonly stable_id: string;
  readonly name: string | null;
  readonly category: string | null;
  readonly day_no: number | null;
  readonly starts_at: string | null;
  readonly tz: string | null;
}

const ITEMS_SQL = `SELECT i.stable_id, p.name, i.category, d.day_no, i.starts_at, i.tz
  FROM plan_items i
  JOIN trips t ON t.id = i.trip_id
  LEFT JOIN plan_days d ON d.id = i.day_id
  LEFT JOIN pois p ON p.id = i.poi_id
  WHERE i.trip_id = ? AND i.version_id = coalesce(t.current_version_id, t.draft_version_id)`;
const ITEMS_TABLES = ['plan_items', 'plan_days', 'pois', 'trips'];

export function reasonLabel(tag: string, dayNo: number | null = null): string {
  switch (tag) {
    case 'group_must_do':
      return t({ id: 'proposal.reason.groupMustDo', message: 'Must-do' });
    case 'group_day':
      return dayNo === null
        ? t({ id: 'proposal.reason.onThePlan', message: 'On the plan' })
        : t({ id: 'proposal.reason.day', message: `Day ${dayNo}` });
    case 'your_must_do':
      return t({ id: 'proposal.reason.mustDo', message: 'Your must-do' });
    case 'matches_taste':
      return t({ id: 'proposal.reason.taste', message: 'You’ll love this' });
    case 'crew_favourite':
      return t({ id: 'proposal.reason.crew', message: 'Crew favourite' });
    case 'good_value':
      return t({ id: 'proposal.reason.value', message: 'Good value' });
    default:
      return t({ id: 'proposal.reason.onlyHere', message: 'Only here' });
  }
}

/** Why the guide put it there, in a sentence for the why sheet. */
export function reasonWhy(tag: string, guideName: string): string {
  switch (tag) {
    case 'your_must_do':
      return t({ id: 'proposal.why.mustDo', message: 'You added it as a must-do in setup.' });
    case 'matches_taste':
      return t({
        id: 'proposal.why.taste',
        message: `It matches what you picked in your this-or-thats, so ${guideName} put it in.`,
      });
    case 'crew_favourite':
      return t({ id: 'proposal.why.crew', message: 'Most of the crew wanted this one.' });
    case 'good_value':
      return t({ id: 'proposal.why.value', message: 'It gives a lot for what it costs.' });
    default:
      return t({ id: 'proposal.why.onlyHere', message: 'You can only do this here.' });
  }
}

export function usePicks(
  tripId: string,
  highlights: readonly Highlight[],
  slides: readonly Slide[],
): readonly Pick[] {
  const { rows } = useLiveRows<ItemRow>(ITEMS_SQL, [tripId], ITEMS_TABLES);
  const byId = new Map(rows.map((row) => [row.stable_id, row]));
  return highlights.flatMap((h) => {
    const row = byId.get(h.item_id);
    const slide = slides.find((s) => s.item_id === h.item_id);
    const title = row?.name ?? slide?.headline ?? row?.category ?? null;
    if (title === null) return [];
    return [
      {
        itemId: h.item_id,
        title,
        dayNo: row?.day_no ?? null,
        startsAt: row?.starts_at ?? null,
        tz: row?.tz ?? null,
        category: row?.category ?? null,
        reasonTag: h.reason_tag,
      },
    ];
  });
}

interface PlanRow {
  readonly stable_id: string;
  readonly name: string | null;
  readonly must_do_title: string | null;
  readonly must_do_id: string | null;
  readonly category: string | null;
  readonly day_no: number | null;
  readonly starts_at: string | null;
  readonly tz: string | null;
}

const PLAN_SQL = `SELECT i.stable_id, p.name, m.title AS must_do_title, i.must_do_id, i.category,
    d.day_no, i.starts_at, i.tz
  FROM plan_items i
  JOIN trips t ON t.id = i.trip_id AND t.current_version_id = i.version_id
  LEFT JOIN plan_days d ON d.id = i.day_id
  LEFT JOIN pois p ON p.id = i.poi_id
  LEFT JOIN must_dos m ON m.id = i.must_do_id
  WHERE i.trip_id = ?
  ORDER BY d.day_no, i.starts_at, i.stable_id`;
const PLAN_TABLES = ['plan_items', 'plan_days', 'pois', 'must_dos', 'trips'];

/** Tags a group version may carry: what the stop is, never a claim about the reader. */
export const GROUP_TAG_MUST_DO = 'group_must_do';
export const GROUP_TAG_DAY = 'group_day';

/**
 * The group version's highlights, from the plan the crew can read once the proposal is sent: the
 * crew's must-dos first, then one named stop per day, at most `limit`.
 */
export function groupPicks(rows: readonly PlanRow[], limit = 5): Pick[] {
  const named = rows.filter((row) => (row.name ?? row.must_do_title) !== null);
  const toPick = (row: PlanRow, reasonTag: string): Pick => ({
    itemId: row.stable_id,
    title: row.name ?? row.must_do_title ?? '',
    dayNo: row.day_no,
    startsAt: row.starts_at,
    tz: row.tz,
    category: row.category,
    reasonTag,
  });
  const picks = named
    .filter((row) => row.must_do_id !== null)
    .map((row) => toPick(row, GROUP_TAG_MUST_DO));
  const days = new Set(picks.map((pick) => pick.dayNo));
  for (const row of named) {
    if (row.must_do_id !== null || days.has(row.day_no)) continue;
    days.add(row.day_no);
    picks.push(toPick(row, GROUP_TAG_DAY));
  }
  return picks.slice(0, limit);
}

export function useGroupPicks(tripId: string): readonly Pick[] {
  const { rows } = useLiveRows<PlanRow>(PLAN_SQL, [tripId], PLAN_TABLES);
  return groupPicks(rows);
}
