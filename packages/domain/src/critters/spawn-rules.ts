/**
 * Spawn rules as devices and the worker read them (`spawn_rules`, synced in `trip_pack`; the
 * legendary window's `rule` from `legendary_windows`): the five spawn kinds, window arithmetic on a
 * place's calendar day, the solar gate, and the daily rotation that shows a whole crew the same
 * local at a spot. Content validation of the same shapes lives in `@cp/content`; this module only
 * reads published rows, so every new critter a release adds is picked up from the data.
 */
import { z } from 'zod';

import { solarConditionHolds, SOLAR_CONDITIONS, type SolarCondition } from './solar';

export const SPAWN_KINDS = ['presence', 'any_of', 'set_count', 'window', 'co_presence'] as const;
export const spawnKindSchema = z.enum(SPAWN_KINDS);
export type SpawnKind = z.infer<typeof spawnKindSchema>;

export const solarConditionSchema = z.enum(SOLAR_CONDITIONS);

const monthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u);

export const windowRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('annual_range'), start: monthDay, end: monthDay }),
  z.object({
    type: z.literal('month_part'),
    month: z.number().int().min(1).max(12),
    part: z.enum(['early', 'mid', 'late']),
  }),
  z.object({ type: z.literal('any_day') }),
]);
export type WindowRule = z.infer<typeof windowRuleSchema>;

export const spawnGeofenceSchema = z.object({
  label: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_m: z.number().positive(),
});
export type SpawnGeofence = z.infer<typeof spawnGeofenceSchema>;

/** One `spawn_rules` row as synced (snake_case columns). */
export const spawnRuleRowSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  form_id: z.uuid(),
  kind: spawnKindSchema,
  set_id: z.uuid(),
  destination_id: z.uuid().nullable(),
  poi_ids: z.array(z.uuid()),
  geofences: z.array(spawnGeofenceSchema),
  n: z.number().int().nullable(),
  dwell_s: z.number().int().min(0),
  hold_ms: z.number().int().nullable(),
  window_id: z.uuid().nullable(),
  solar: solarConditionSchema.nullable(),
  min_members: z.number().int().nullable(),
  foreground_only: z.boolean(),
  copy: z.string(),
});
export type SpawnRuleRow = z.infer<typeof spawnRuleRowSchema>;

/** Default hold ceremony length; legendaries take longer (3l-10's slower gold ring). */
export const DEFAULT_HOLD_MS = 1500;
export const LEGENDARY_HOLD_MS = 2500;
export const HOLD_RELEASE_DRAIN_MS = 450;

export function holdMs(rule: Pick<SpawnRuleRow, 'hold_ms' | 'kind'>): number {
  if (rule.hold_ms !== null) return rule.hold_ms;
  return rule.kind === 'window' || rule.kind === 'co_presence'
    ? LEGENDARY_HOLD_MS
    : DEFAULT_HOLD_MS;
}

const PART_DAYS = { early: [1, 10], mid: [11, 20], late: [21, 31] } as const;

/** `MM-DD` of a local `YYYY-MM-DD` date. */
const mmdd = (localDate: string): string => localDate.slice(5, 10);

/** Whether the window is open on the place's calendar day `localDate` (`YYYY-MM-DD`). */
export function windowOpenOn(rule: WindowRule, localDate: string): boolean {
  switch (rule.type) {
    case 'any_day':
      return true;
    case 'annual_range': {
      const day = mmdd(localDate);
      return rule.start <= rule.end
        ? day >= rule.start && day <= rule.end
        : day >= rule.start || day <= rule.end;
    }
    case 'month_part': {
      const month = Number(localDate.slice(5, 7));
      const day = Number(localDate.slice(8, 10));
      const [from, to] = PART_DAYS[rule.part];
      return month === rule.month && day >= from && day <= to;
    }
  }
}

function addDays(localDate: string, days: number): string {
  const t = Date.parse(`${localDate}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export interface WindowSpan {
  /** First open local day. */
  readonly start: string;
  /** Last open local day. */
  readonly end: string;
}

/** One window never spans more than a year: every extent scan stops here. */
const MAX_SPAN_DAYS = 366;
/** A 02-29 window opens only in leap years: the next opening can be four years away. */
const MAX_LOOKAHEAD_DAYS = 4 * 366;

/**
 * The next opening of a dated window on or after `fromLocalDate` (an open window counts from its
 * own first day). `null` when there is nothing to wait for: an any-day window, a range covering
 * the whole year (open every day, so it never opens or closes), or a date that never comes. Every
 * scan is bounded, so a content row can never hang a device or the worker.
 */
export function nextWindowSpan(rule: WindowRule, fromLocalDate: string): WindowSpan | null {
  if (rule.type === 'any_day') return null;
  let start = fromLocalDate;
  if (windowOpenOn(rule, start)) {
    let back = 0;
    while (back < MAX_SPAN_DAYS && windowOpenOn(rule, addDays(start, -1))) {
      start = addDays(start, -1);
      back += 1;
    }
    if (back >= MAX_SPAN_DAYS) return null;
  } else {
    let ahead = 0;
    while (ahead < MAX_LOOKAHEAD_DAYS && !windowOpenOn(rule, start)) {
      start = addDays(start, 1);
      ahead += 1;
    }
    if (!windowOpenOn(rule, start)) return null;
  }
  let end = start;
  let length = 1;
  while (length < MAX_SPAN_DAYS && windowOpenOn(rule, addDays(end, 1))) {
    end = addDays(end, 1);
    length += 1;
  }
  if (length >= MAX_SPAN_DAYS) return null;
  return { start, end };
}

export interface SpawnContext {
  /** Now, and the place's calendar day at now. */
  readonly at: Date;
  readonly localDate: string;
  /** The spot (a POI or geofence centre), for the solar gate. */
  readonly lat: number;
  readonly lng: number;
  /** The legendary window's rule, when the spawn has one. */
  readonly window: WindowRule | null;
  /** Forms the user already owns in the rule's set (set_count). */
  readonly ownedInSet: number;
  /** Distinct places of this rule the user has already dwelled at (any_of). */
  readonly placesDone: number;
}

export type SpawnGate = 'open' | 'window_closed' | 'solar_closed' | 'needs_more_of_set';

/**
 * Whether a spawn can start an encounter now. `any_of` with n > 1 stays open: each place's dwell
 * counts and the n-th befriends. Co-presence opens like any spawn; the crew grant is the server's.
 */
export function spawnGate(rule: SpawnRuleRow, ctx: SpawnContext): SpawnGate {
  if (ctx.window !== null && !windowOpenOn(ctx.window, ctx.localDate)) return 'window_closed';
  if (
    rule.solar !== null &&
    !solarConditionHolds(rule.solar, ctx.at, ctx.localDate, ctx.lat, ctx.lng)
  ) {
    return 'solar_closed';
  }
  if (rule.kind === 'set_count' && ctx.ownedInSet < (rule.n ?? 1)) return 'needs_more_of_set';
  return 'open';
}

/** `any_of`: how many distinct places complete the rule (default one). */
export function placesNeeded(rule: Pick<SpawnRuleRow, 'kind' | 'n'>): number {
  return rule.kind === 'any_of' ? Math.max(1, rule.n ?? 1) : 1;
}

/** FNV-1a 32-bit: stable across JS engines, so app and server agree. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The day's local at one spot: when several rules share a place, one is picked per (trip, local
 * date, place), so everyone on the trip meets the same critter there that day. Rules are sorted by
 * id first so the input order never matters.
 */
export function rotationPick<T extends { readonly id: string }>(
  tripId: string,
  localDate: string,
  placeKey: string,
  candidates: readonly T[],
): T | undefined {
  if (candidates.length === 0) return undefined;
  const sorted = [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted[fnv1a(`${tripId}|${localDate}|${placeKey}`) % sorted.length];
}

export type { SolarCondition };
