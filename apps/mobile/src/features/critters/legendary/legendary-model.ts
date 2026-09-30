/**
 * The legendary calendar (3l-9) as data: every legendary window with its month label, gold
 * silhouette, whether it falls on your next trip's dates, whether a reminder is set, and for a
 * crew co-presence legendary how many of the crew are there. Names only for my own finds.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { nextWindowSpan, toLocalWallTime, type WindowRule } from '@cp/domain';

import type { EntryRow, TripRow, WindowRow } from '../data/queries';
import { windowRule } from '../dex/dex-model';

export const WINDOW_ART_SQL = `SELECT f.id AS form_id, c.key, c.no, c.canonical_seed, c.id AS critter_id
  FROM critter_forms f JOIN critters c ON c.id = f.critter_id
  WHERE f.id IN (SELECT form_id FROM legendary_windows)`;
export const WINDOW_ART_TABLES = ['critter_forms', 'critters', 'legendary_windows'];

export interface WindowArtRow {
  readonly form_id: string;
  readonly key: string;
  readonly no: number;
  readonly canonical_seed: number | null;
  readonly critter_id: string;
}

export const REMINDERS_SQL = `SELECT target_id FROM reminders
  WHERE user_id = ? AND target_kind = 'legendary' AND status = 'pending'`;
export const REMINDERS_TABLES = ['reminders'];

export const COPRESENCE_RULES_SQL = `SELECT id, window_id, min_members FROM spawn_rules
  WHERE kind = 'co_presence' AND window_id IS NOT NULL`;
export const COPRESENCE_RULES_TABLES = ['spawn_rules'];

export interface CopresenceRuleRow {
  readonly id: string;
  readonly window_id: string;
  readonly min_members: number | null;
}

export interface Copresence {
  readonly here: number;
  readonly needed: number;
  readonly missing: readonly string[];
}

export type WindowLabel =
  | { readonly kind: 'range'; readonly month: number; readonly days: string }
  | { readonly kind: 'part'; readonly month: number; readonly part: 'early' | 'mid' | 'late' }
  | { readonly kind: 'any' };

export interface LegendaryItem {
  readonly windowId: string;
  readonly formId: string;
  readonly critterKey: string | null;
  readonly seed: number;
  readonly name: string | null;
  readonly placeLine: string;
  readonly label: WindowLabel;
  readonly found: boolean;
  readonly reminder: boolean;
  readonly onYourDates: boolean;
  /** Months (1–12) the window can open in. */
  readonly months: readonly number[];
  readonly nextStart: string | null;
  readonly copresence: Copresence | null;
}

function labelOf(rule: WindowRule): WindowLabel {
  if (rule.type === 'any_day') return { kind: 'any' };
  if (rule.type === 'month_part') return { kind: 'part', month: rule.month, part: rule.part };
  const month = Number(rule.start.slice(0, 2));
  const from = Number(rule.start.slice(3));
  const to = Number(rule.end.slice(3));
  const sameMonth = rule.start.slice(0, 2) === rule.end.slice(0, 2);
  return {
    kind: 'range',
    month,
    days: from === to && sameMonth ? String(from) : sameMonth ? `${from}–${to}` : `${from}+`,
  };
}

function monthsOf(rule: WindowRule): number[] {
  if (rule.type === 'any_day') return [];
  if (rule.type === 'month_part') return [rule.month];
  const a = Number(rule.start.slice(0, 2));
  const b = Number(rule.end.slice(0, 2));
  const out: number[] = [];
  for (let m = a; ; m = (m % 12) + 1) {
    out.push(m);
    if (m === b || out.length === 12) break;
  }
  return out;
}

export function buildLegendaries(input: {
  readonly windows: readonly WindowRow[];
  readonly art: readonly WindowArtRow[];
  readonly entries: readonly EntryRow[];
  readonly reminders: ReadonlySet<string>;
  readonly trip: Pick<TripRow, 'start_date' | 'end_date'> | null;
  readonly now: Date;
  readonly tz: string;
  readonly copresence: ReadonlyMap<string, Copresence>;
}): LegendaryItem[] {
  const today = toLocalWallTime(input.now, input.tz).date;
  const art = new Map(input.art.map((a) => [a.form_id, a]));
  const items: LegendaryItem[] = [];
  for (const row of input.windows) {
    const rule = windowRule(row);
    if (rule === null) continue;
    const a = art.get(row.form_id);
    const entry = input.entries.find(
      (e) => e.form_id === row.form_id && e.verification === 'verified',
    );
    const span = nextWindowSpan(rule, today);
    const trip = input.trip;
    const onYourDates =
      trip !== null &&
      trip.start_date !== null &&
      trip.end_date !== null &&
      rule.type !== 'any_day' &&
      (() => {
        const s = trip.start_date === null ? null : nextWindowSpan(rule, trip.start_date);
        return s !== null && trip.end_date !== null && s.start <= trip.end_date;
      })();
    items.push({
      windowId: row.id,
      formId: row.form_id,
      critterKey: a?.key ?? null,
      seed: a?.canonical_seed ?? a?.no ?? 0,
      name: entry?.form_name ?? entry?.critter_name ?? null,
      placeLine: row.place_line ?? '',
      label: labelOf(rule),
      found: entry !== undefined,
      reminder: input.reminders.has(row.id),
      onYourDates,
      months: monthsOf(rule),
      nextStart: span?.start ?? null,
      copresence: input.copresence.get(row.id) ?? null,
    });
  }
  return items.sort((x, y) => (x.nextStart ?? '9999').localeCompare(y.nextStart ?? '9999'));
}

/** The twelve months: which have a legendary, which your next trip covers, which is now. */
export function stripMonths(
  items: readonly LegendaryItem[],
  trip: Pick<TripRow, 'start_date' | 'end_date'> | null,
  currentMonth: number,
): { month: number; legendary: boolean; inTrip: boolean; current: boolean }[] {
  const tripMonths = new Set<number>();
  if (trip?.start_date != null && trip.end_date != null) {
    let d = trip.start_date.slice(0, 7);
    const end = trip.end_date.slice(0, 7);
    for (let i = 0; i < 12; i += 1) {
      tripMonths.add(Number(d.slice(5, 7)));
      if (d >= end) break;
      const [y, m] = [Number(d.slice(0, 4)), Number(d.slice(5, 7))];
      d = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    }
  }
  const legendary = new Set(items.flatMap((i) => i.months));
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    legendary: legendary.has(i + 1),
    inTrip: tripMonths.has(i + 1),
    current: i + 1 === currentMonth,
  }));
}
