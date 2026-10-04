/**
 * The picks a version highlights (3f-3), joined to the plan they came from and set in the plan's
 * own order (day, then time): the stop's name, its day and start, whose must-do it is, and the
 * reason tag the guide gave ("YOU PICKED STREET FOOD"; the words are in ./reasons.ts). Before the crew
 * can read the plan itself (a draft is the organiser's), a pick is named by the story slide the
 * guide wrote about it; one with neither is dropped.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useGuideText } from '@/lib/i18n/guide-text';

import { firstName } from './format';
import type { Highlight, Slide } from './proposal';
import { GROUP_TAG_DAY, GROUP_TAG_MUST_DO, cardLabel } from './reasons';
import { parseJson, useLiveRows } from './rows';

export interface Pick {
  readonly itemId: string;
  readonly title: string;
  readonly dayNo: number | null;
  readonly startsAt: string | null;
  readonly tz: string | null;
  readonly category: string | null;
  readonly reasonTag: string;
  /** The guide's own words for the card's tag ("YOU PICKED STREET FOOD"), when it wrote any. */
  readonly reasonLabel: string | null;
  /** What the guide wrote about the stop and its day, as this person reads them. */
  readonly note: string | null;
  readonly dayTheme: string | null;
  /** Whose must-do the stop is, when it is one: what is actually known about why it is there. */
  readonly mustDoOwnerId?: string | null;
  readonly mustDoOwnerName?: string | null;
  /** The stop's place in the catalogue, when it has one: its page can be opened. */
  readonly poiId?: string | null;
}

interface ItemRow {
  readonly stable_id: string;
  readonly poi_id: string | null;
  readonly name: string | null;
  readonly category: string | null;
  readonly day_no: number | null;
  readonly starts_at: string | null;
  readonly tz: string | null;
  readonly notes: string | null;
  readonly i18n: string | null;
  readonly theme: string | null;
  readonly day_i18n: string | null;
  readonly must_do_owner?: string | null;
  readonly must_do_owner_name?: string | null;
}

const ITEMS_SQL = `SELECT i.stable_id, i.poi_id, p.name, i.category, d.day_no, i.starts_at, i.tz,
    i.notes, i.i18n, d.theme, d.i18n AS day_i18n, m.owner_id AS must_do_owner,
    u.display_name AS must_do_owner_name
  FROM plan_items i
  JOIN trips t ON t.id = i.trip_id
  LEFT JOIN plan_days d ON d.id = i.day_id
  LEFT JOIN pois p ON p.id = i.poi_id
  LEFT JOIN must_dos m ON m.id = i.must_do_id
  LEFT JOIN users u ON u.id = m.owner_id
  WHERE i.trip_id = ? AND i.version_id = coalesce(t.current_version_id, t.draft_version_id)`;
const ITEMS_TABLES = ['plan_items', 'plan_days', 'pois', 'trips', 'must_dos', 'users'];

export {
  cardLabel,
  GROUP_TAG_DAY,
  GROUP_TAG_MUST_DO,
  pickTag,
  reasonLabel,
  reasonWhy,
} from './reasons';

/** Day by day, earlier first; a stop with no day or time goes after those that have one. */
export function inPlanOrder<T extends PlanSlot>(picks: readonly T[]): T[] {
  const day = (slot: PlanSlot) => slot.dayNo ?? Number.MAX_SAFE_INTEGER;
  // Instants are ISO strings: they sort as text. "~" sorts after every digit.
  const time = (slot: PlanSlot) => slot.startsAt ?? '~';
  return [...picks].sort(
    (a, b) => day(a) - day(b) || (time(a) < time(b) ? -1 : time(a) > time(b) ? 1 : 0),
  );
}

interface PlanSlot {
  readonly dayNo: number | null;
  readonly startsAt: string | null;
}

export function usePicks(
  tripId: string,
  highlights: readonly Highlight[],
  slides: readonly Slide[],
): readonly Pick[] {
  const { rows } = useLiveRows<ItemRow>(ITEMS_SQL, [tripId], ITEMS_TABLES);
  const byId = new Map(rows.map((row) => [row.stable_id, row]));
  const names = usePlaceNames(tripId);
  const text = useGuideText();
  const picks = highlights.flatMap((h): Pick[] => {
    const row = byId.get(h.item_id);
    const slide = slides.find((s) => s.item_id === h.item_id);
    const placed = row?.poi_id == null ? undefined : names.get(row.poi_id);
    const title = placed ?? row?.name ?? slide?.headline ?? row?.category ?? null;
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
        reasonLabel: cardLabel(h.reason_label),
        note:
          row === undefined
            ? null
            : text('plan_item', { notes: row.notes, i18n: row.i18n }, 'notes'),
        dayTheme:
          row === undefined
            ? null
            : text('plan_day', { theme: row.theme, i18n: row.day_i18n }, 'theme'),
        poiId: row?.poi_id ?? null,
        mustDoOwnerId: row?.must_do_owner ?? null,
        mustDoOwnerName: firstName(row?.must_do_owner_name ?? null) || null,
      },
    ];
  });
  // The guide lists what it thinks the reader will love first; a traveller reads a plan in order.
  return inPlanOrder(picks);
}

export interface StopTime {
  readonly dayNo: number | null;
  readonly startsAt: string | null;
  readonly tz: string | null;
}

/** When each stop of the plan happens, by item: a trailer slide about a stop says its day and time. */
export function useStopTimes(tripId: string | null): ReadonlyMap<string, StopTime> {
  const { rows } = useLiveRows<ItemRow>(ITEMS_SQL, tripId === null ? null : [tripId], ITEMS_TABLES);
  return new Map(
    rows.map((row) => [row.stable_id, { dayNo: row.day_no, startsAt: row.starts_at, tz: row.tz }]),
  );
}

interface PlanRow {
  readonly stable_id: string;
  readonly poi_id: string | null;
  readonly name: string | null;
  readonly must_do_title: string | null;
  readonly must_do_id: string | null;
  readonly category: string | null;
  readonly day_no: number | null;
  readonly starts_at: string | null;
  readonly tz: string | null;
}

const PLAN_SQL = `SELECT i.stable_id, i.poi_id, p.name, m.title AS must_do_title, i.must_do_id, i.category,
    d.day_no, i.starts_at, i.tz
  FROM plan_items i
  JOIN trips t ON t.id = i.trip_id AND t.current_version_id = i.version_id
  LEFT JOIN plan_days d ON d.id = i.day_id
  LEFT JOIN pois p ON p.id = i.poi_id
  LEFT JOIN must_dos m ON m.id = i.must_do_id
  WHERE i.trip_id = ?
  ORDER BY d.day_no, i.starts_at, i.stable_id`;
const PLAN_TABLES = ['plan_items', 'plan_days', 'pois', 'must_dos', 'trips'];

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
    reasonLabel: null,
    note: null,
    dayTheme: null,
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
  return inPlanOrder(picks.slice(0, limit));
}

const PLACES_SQL = `SELECT v.coverage FROM itinerary_versions v
  JOIN trips t ON t.current_version_id = v.id WHERE t.id = ?`;

/**
 * The plan version's own place names (the display fields the draft keeps for every named place,
 * keyed by place id): a drafted stop's place is often not in the phone's place catalogue.
 */
function usePlaceNames(tripId: string): ReadonlyMap<string, string> {
  const { rows } = useLiveRows<{ coverage: string | null }>(
    PLACES_SQL,
    [tripId],
    ['itinerary_versions', 'trips'],
  );
  const places = parseJson<{ places?: Record<string, { name?: string }> } | null>(
    rows[0]?.coverage,
    null,
  )?.places;
  return new Map(
    Object.entries(places ?? {}).flatMap(([id, place]) =>
      typeof place.name === 'string' ? [[id, place.name] as const] : [],
    ),
  );
}

export function useGroupPicks(tripId: string): readonly Pick[] {
  const { rows } = useLiveRows<PlanRow>(PLAN_SQL, [tripId], PLAN_TABLES);
  const names = usePlaceNames(tripId);
  return groupPicks(
    rows.map((row) => ({
      ...row,
      name: (row.poi_id === null ? undefined : names.get(row.poi_id)) ?? row.name,
    })),
  );
}
