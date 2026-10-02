/**
 * The plan as every plan surface reads it: days and labelled items from the synced rows, the
 * domain `PlanState` the ops replay against, and each day card of the overview (3e-1) with its
 * derived chip: a booking pins BOOKED, an open decision on the day shows VOTE (with the ballots
 * cast so far), otherwise the destination forecast's doodle for that date.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and keys, never copy. */
import { weatherSnapshotBodySchema, type PlanState, type PlanStateItem } from '@cp/domain';

import { guideText } from '@/lib/i18n/guide-text';

import { stopName } from '../../stop-name';

import {
  idArray,
  jsonArray,
  type OpenPollRow,
  type PlanDayRow,
  type PlanItemRow,
  type WeatherRow,
} from '../data/plan-rows';

export interface PlanDay {
  readonly dayNo: number;
  /** Local date `YYYY-MM-DD`; null while the trip's dates are open. */
  readonly date: string | null;
  readonly theme: string | null;
}

export interface PlanItem {
  readonly stableId: string;
  readonly dayNo: number;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly tz: string | null;
  /** The place, booking or note that names the item; null when it has none of them. */
  readonly label: string | null;
  readonly category: string | null;
  readonly poiId: string | null;
  readonly bookingId: string | null;
  readonly mustDoId: string | null;
  readonly lockedReason: string | null;
  readonly status: string | null;
  readonly byGuide: boolean;
  readonly attendeeIds: readonly string[];
  readonly lat: number | null;
  readonly lng: number | null;
  readonly amountMinor: number | null;
  readonly currency: string | null;
  readonly costModel: string | null;
  /** In my plan only ("just you"): my own addition or my change to a crew item. */
  readonly justYou?: boolean;
}

export type WeatherIcon = 'rain' | 'sun' | 'wave';

export type DayChip =
  | { readonly kind: 'booked' }
  | { readonly kind: 'vote'; readonly pollId: string; readonly ballots: number }
  | { readonly kind: 'weather'; readonly icon: WeatherIcon }
  | null;

export interface DayCard {
  /** Follows the day's plan when a reorder moves it to another date (row identity). */
  readonly key: string;
  readonly dayNo: number;
  readonly date: string | null;
  readonly theme: string | null;
  /** Item labels in time order (with the start time of booked ones); empty on a free day. */
  readonly summary: readonly string[];
  readonly chip: DayChip;
  /** How many of the day's items are mine only. */
  readonly personal: number;
  /** Holds a booking: the day keeps its date and never moves in a reorder. */
  readonly fixed: boolean;
  readonly when: 'past' | 'today' | 'future';
}

/** The days as `locale` reads them: a theme the guide wrote shows in the app's language. */
export function toPlanDays(rows: readonly PlanDayRow[], locale = 'en'): PlanDay[] {
  return rows.map((row) => ({
    dayNo: row.day_no,
    date: row.date,
    theme: guideText('plan_day', row, 'theme', locale),
  }));
}

export function toPlanItems(
  rows: readonly PlanItemRow[],
  locale = 'en',
  places: ReadonlyMap<string, string> = new Map(),
): PlanItem[] {
  return rows.map((row) => ({
    stableId: row.stable_id,
    dayNo: row.day_no,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    tz: row.tz,
    // Named as everywhere the plan shows a stop (../../stop-name); never the guide's note.
    label: stopName({ ...row, notes: guideText('plan_item', row, 'notes', locale) }, places),
    category: row.category,
    poiId: row.poi_id,
    bookingId: row.booking_id,
    mustDoId: row.must_do_id,
    lockedReason: row.locked_reason,
    status: row.status,
    byGuide: row.created_by_kind === 'guide',
    attendeeIds: idArray(row.attendee_ids),
    lat: row.lat,
    lng: row.lng,
    amountMinor: row.amount_minor,
    currency: row.currency,
    costModel: row.cost_model,
  }));
}

function optional<K extends string, V>(key: K, value: V | null): { [P in K]?: V } {
  return (value === null ? {} : { [key]: value }) as { [P in K]?: V };
}

/** The plan as `@cp/domain` replays ops against it (the server applies the same edits). */
export function toPlanState(days: readonly PlanDay[], items: readonly PlanItem[]): PlanState {
  return {
    days: days.map((day) => ({ day_no: day.dayNo, date: day.date, theme: day.theme })),
    items: items.map((item): PlanStateItem => ({
      stable_id: item.stableId,
      day_no: item.dayNo,
      ...optional('starts_at', item.startsAt),
      ...optional('ends_at', item.endsAt),
      ...optional('tz', item.tz),
      ...optional('booking_id', item.bookingId),
      ...optional('poi_id', item.poiId),
      ...optional('must_do_id', item.mustDoId),
      ...optional('category', item.category),
      attendee_ids: [...item.attendeeIds],
    })),
  };
}

/** `HH:mm` of an instant in the item's own zone. */
export function localTime(at: string | null, tz: string | null): string | null {
  if (at === null) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(tz === null ? {} : { timeZone: tz }),
  }).format(date);
}

/** Rain when the day is likelier wet than dry; the sea on a beach day; otherwise the sun. */
export function weatherIcon(row: WeatherRow | undefined, beachDay: boolean): WeatherIcon | null {
  if (row === undefined) return null;
  let parsed;
  try {
    parsed = weatherSnapshotBodySchema.safeParse(JSON.parse(row.hourly));
  } catch {
    return null;
  }
  if (!parsed.success) return null;
  if (parsed.data.day.chance_of_rain >= 50) return 'rain';
  return beachDay ? 'wave' : 'sun';
}

/** The open poll deciding something on each day (matched by its options' place or item ids). */
function pollsByDay(
  items: readonly PlanItem[],
  polls: readonly OpenPollRow[],
): Map<number, { pollId: string; ballots: number }> {
  const byDay = new Map<number, { pollId: string; ballots: number }>();
  for (const poll of polls) {
    if (poll.ref_id === null) continue;
    for (const item of items) {
      if (item.poiId !== poll.ref_id && item.stableId !== poll.ref_id) continue;
      if (!byDay.has(item.dayNo)) {
        byDay.set(item.dayNo, { pollId: poll.id, ballots: Number(poll.ballots) });
      }
    }
  }
  return byDay;
}

/** Stable, unique row keys (two free days share a plan-less key otherwise). */
export function rowKeys(cards: readonly DayCard[]): string[] {
  const seen = new Map<string, number>();
  return cards.map((card) => {
    const n = seen.get(card.key) ?? 0;
    seen.set(card.key, n + 1);
    return n === 0 ? card.key : `${card.key}#${n}`;
  });
}

export function dayWhen(date: string | null, today: string | null): DayCard['when'] {
  if (date === null || today === null) return 'future';
  if (date < today) return 'past';
  return date === today ? 'today' : 'future';
}

export function buildDayCards(input: {
  readonly days: readonly PlanDay[];
  readonly items: readonly PlanItem[];
  readonly polls: readonly OpenPollRow[];
  readonly weather: readonly WeatherRow[];
  /** Today's date in the trip's zone, once the trip is under way; null before. */
  readonly today: string | null;
}): DayCard[] {
  const votes = pollsByDay(input.items, input.polls);
  const weatherByDate = new Map(input.weather.map((row) => [row.date, row]));
  return input.days.map((day) => {
    const items = input.items.filter((item) => item.dayNo === day.dayNo);
    const fixed = items.some((item) => item.bookingId !== null);
    const vote = votes.get(day.dayNo);
    const beachDay = items.some((item) => item.category === 'beach');
    const icon = day.date === null ? null : weatherIcon(weatherByDate.get(day.date), beachDay);
    const chip: DayChip = fixed
      ? { kind: 'booked' }
      : vote !== undefined
        ? { kind: 'vote', pollId: vote.pollId, ballots: vote.ballots }
        : icon === null
          ? null
          : { kind: 'weather', icon };
    const summary = items.flatMap((item) => {
      if (item.label === null) return [];
      const time = item.bookingId === null ? null : localTime(item.startsAt, item.tz);
      return [time === null ? item.label : `${item.label} ${time}`];
    });
    const first = items[0]?.stableId;
    return {
      key: first ?? (day.theme === null ? `day:${day.dayNo}` : `theme:${day.theme}`),
      dayNo: day.dayNo,
      date: day.date,
      theme: day.theme,
      summary,
      chip,
      personal: items.filter((item) => item.justYou === true).length,
      fixed,
      when: dayWhen(day.date, input.today),
    };
  });
}

/** Days an applied guide change set touched (by the items it names, before and after). */
export function guideTouchedDays(
  changeSets: readonly { readonly ops: string | null }[],
  items: readonly PlanItem[],
): Set<number> {
  const dayOf = new Map(items.map((item) => [item.stableId, item.dayNo]));
  const touched = new Set<number>();
  for (const set of changeSets) {
    for (const op of jsonArray<{ target?: string; after?: { day_no?: number } | null }>(set.ops)) {
      const current = op.target === undefined ? undefined : dayOf.get(op.target);
      if (current !== undefined) touched.add(current);
      if (typeof op.after?.day_no === 'number') touched.add(op.after.day_no);
    }
  }
  return touched;
}
