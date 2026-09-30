/**
 * What the encounter screens (3l-4, 3l-5, 3l-6, 3l-10) read beyond the engine: the spawn's form
 * (its art, tier, XP), whether the critter's name is known (my own verified find, or a guide's
 * public name) and the place's crowd forecast for the next quiet window.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { FormSpec } from '@cp/critter-art';
import type { Rarity } from '@cp/domain';

import { parseJson } from '../data/queries';
import { formSpec } from '../dex/dex-model';

export const SPAWN_FORM_SQL = `SELECT f.id, f.rarity, f.palette, f.pose, f.edge, f.xp,
    f.critter_id, c.key, c.no, c.canonical_seed, s.hero_critter_key, g.name AS guide_name,
    (SELECT e.critter_name FROM collection_entries e WHERE e.user_id = ? AND e.critter_id = c.id
       AND e.verification = 'verified' AND e.critter_name IS NOT NULL LIMIT 1) AS known_name,
    (SELECT count(*) FROM critter_forms x WHERE x.critter_id = c.id) AS form_count,
    (SELECT count(*) FROM critter_forms x WHERE x.critter_id = c.id
       AND (x.rarity = 'common' OR (x.rarity = 'rare' AND f.rarity IN ('rare', 'epic', 'legendary'))
         OR (x.rarity = 'epic' AND f.rarity IN ('epic', 'legendary'))
         OR (x.rarity = 'legendary' AND f.rarity = 'legendary'))) AS form_no
  FROM critter_forms f JOIN critters c ON c.id = f.critter_id
  JOIN critter_sets s ON s.id = c.set_id
  LEFT JOIN guides g ON g.slug = s.guide_slug
  WHERE f.id = ?`;
export const SPAWN_FORM_TABLES = [
  'critter_forms',
  'critters',
  'critter_sets',
  'guides',
  'collection_entries',
];

export interface SpawnFormRow {
  readonly id: string;
  readonly rarity: Rarity;
  readonly palette: string | null;
  readonly pose: string | null;
  readonly edge: string | null;
  readonly xp: number | null;
  readonly critter_id: string;
  readonly key: string;
  readonly no: number;
  readonly canonical_seed: number | null;
  readonly hero_critter_key: string | null;
  readonly guide_name: string | null;
  readonly known_name: string | null;
  readonly form_count: number;
  readonly form_no: number;
}

export interface SpawnArt {
  readonly key: string;
  readonly seed: number;
  readonly form: FormSpec | null;
  readonly rarity: Rarity;
  readonly xp: number;
  /** A name the viewer may see: their own verified find's, or the guide's public name. */
  readonly name: string | null;
  readonly formNo: number;
  readonly formCount: number;
}

export function spawnArt(row: SpawnFormRow): SpawnArt {
  const guide = row.key === row.hero_critter_key ? row.guide_name : null;
  return {
    key: row.key,
    seed: row.canonical_seed ?? row.no,
    form: formSpec({ ...row, key: null, requirement_copy: null }),
    rarity: row.rarity,
    xp: row.xp ?? 0,
    name: row.known_name ?? guide,
    formNo: row.form_no,
    formCount: row.form_count,
  };
}

export const FORECAST_SQL = `SELECT dow, hourly FROM crowd_forecasts WHERE poi_id = ?`;
export const FORECAST_TABLES = ['crowd_forecasts'];

export interface ForecastRow {
  readonly dow: number;
  /** JSON: 24 crowd levels, one per local hour (0 empty … 100 packed). */
  readonly hourly: string | null;
}

export interface QuietWindow {
  /** The quiet hour's start, epoch ms. */
  readonly at: number;
  readonly today: boolean;
  /** Its day's crowd levels from 06:00 to 18:00, for the bars; the quiet hour is lit. */
  readonly bars: readonly number[];
  readonly litIndex: number;
}

const FIRST_HOUR = 6;
const LAST_HOUR = 18;

/**
 * The next quiet hour between 06:00 and 18:00 local, over the rest of today and tomorrow: the
 * least crowded one, the earliest on a tie. `offsetMin` is the place's UTC offset now. Null
 * without a forecast for those days.
 */
export function nextQuietWindow(
  rows: readonly ForecastRow[],
  nowMs: number,
  offsetMin: number,
): QuietWindow | null {
  const local = new Date(nowMs + offsetMin * 60_000);
  const hourNow = local.getUTCHours();
  let best: (QuietWindow & { readonly level: number }) | null = null;
  for (const dayOffset of [0, 1]) {
    const day = new Date(local.getTime() + dayOffset * 86_400_000);
    const hourly = parseJson<number[]>(rows.find((r) => r.dow === day.getUTCDay())?.hourly, []);
    if (hourly.length < 24) continue;
    const midnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    for (let h = FIRST_HOUR; h <= LAST_HOUR; h += 1) {
      if (dayOffset === 0 && h <= hourNow) continue;
      const level = hourly[h] ?? 100;
      if (best !== null && level >= best.level) continue;
      best = {
        at: midnight + h * 3_600_000 - offsetMin * 60_000,
        today: dayOffset === 0,
        bars: hourly.slice(FIRST_HOUR, LAST_HOUR + 1),
        litIndex: h - FIRST_HOUR,
        level,
      };
    }
  }
  if (best === null) return null;
  const { level: _level, ...window } = best;
  return window;
}

/** The place's UTC offset in minutes at `at` for an IANA zone. */
export function zoneOffsetMin(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}
