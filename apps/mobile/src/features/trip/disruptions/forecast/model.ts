/**
 * The forecast screen (3k-7) worked out from synced rows: the day strip (one column per day with
 * a forecast: high, chance of rain, the day's theme) and the watch list in impact order (PLAN B,
 * WATCHING, SET, GO), with when it was last checked and whether that is stale. Pure.
 */
import { watchRank, watchStatusSchema, type WatchStatus } from '@cp/domain';

/** A check older than this is shown as stale (the watcher runs at least every three hours). */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

const WET_CHANCE = 60;

export interface SnapshotRow {
  readonly date: string;
  readonly hourly: string | null;
}

export interface DayRow {
  readonly date: string | null;
  readonly theme: string | null;
  readonly i18n: string | null;
}

export interface WatchRowData {
  readonly id: string;
  readonly kind: string;
  readonly day: string;
  readonly status: string;
  readonly score: number;
  readonly title: string;
  readonly detail: string;
  readonly i18n: string | null;
  readonly checked_at: string;
  readonly poll_id: string | null;
  readonly disruption_id: string | null;
}

export interface ForecastHour {
  readonly at: string;
  readonly tempC: number;
  readonly rainPct: number;
}

export interface ForecastDay {
  readonly date: string;
  readonly today: boolean;
  readonly highC: number | null;
  readonly rainPct: number;
  readonly wet: boolean;
  readonly hours: readonly ForecastHour[];
}

export type WatchIcon = 'wave' | 'rain' | 'volcano' | 'star' | 'car' | 'temple';

export interface WatchEntry {
  readonly row: WatchRowData;
  readonly status: WatchStatus;
  readonly icon: WatchIcon;
  /** Where a tap goes: the storm decision when one is open for the row. */
  readonly pollId: string | null;
}

export interface ForecastModel {
  readonly days: readonly ForecastDay[];
  readonly watch: readonly WatchEntry[];
  /** Nothing threatens the plan: every row is GO or SET (or there are none). */
  readonly allClear: boolean;
  readonly checkedAt: Date | null;
  readonly stale: boolean;
}

const ICONS: Readonly<Record<string, WatchIcon>> = {
  marine: 'wave',
  weather: 'rain',
  volcano: 'volcano',
  crowds: 'star',
  traffic: 'car',
  closure: 'temple',
};

interface Hourly {
  day?: { max_temp_c?: number; chance_of_rain?: number };
  hours?: { at: string; temp_c: number; chance_of_rain: number }[];
}

function parseHourly(text: string | null): Hourly {
  if (text === null) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === 'object' && value !== null ? value : {};
  } catch {
    return {};
  }
}

export function forecastDays(snapshots: readonly SnapshotRow[], today: string): ForecastDay[] {
  const byDate = new Map<string, SnapshotRow>();
  // The newest snapshot of a date wins (rows arrive newest first).
  for (const row of snapshots) if (!byDate.has(row.date)) byDate.set(row.date, row);
  return [...byDate.values()]
    .filter((row) => row.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => {
      const body = parseHourly(row.hourly);
      const hours = (body.hours ?? []).map((hour) => ({
        at: hour.at,
        tempC: hour.temp_c,
        rainPct: hour.chance_of_rain,
      }));
      const rainPct =
        body.day?.chance_of_rain ?? hours.reduce((max, hour) => Math.max(max, hour.rainPct), 0);
      const high =
        body.day?.max_temp_c ??
        (hours.length === 0 ? null : hours.reduce((max, h) => Math.max(max, h.tempC), -Infinity));
      return {
        date: row.date,
        today: row.date === today,
        highC: high,
        rainPct: Math.round(rainPct),
        wet: rainPct >= WET_CHANCE,
        hours,
      };
    });
}

export function forecastModel(
  snapshots: readonly SnapshotRow[],
  watch: readonly WatchRowData[],
  today: string,
  now: Date,
): ForecastModel {
  const entries = watch
    .map((row) => {
      const status = watchStatusSchema.safeParse(row.status);
      return status.success
        ? { row, status: status.data, icon: ICONS[row.kind] ?? 'rain', pollId: row.poll_id }
        : null;
    })
    .filter((entry): entry is WatchEntry => entry !== null)
    .sort(
      (a, b) =>
        watchRank(b.status) - watchRank(a.status) ||
        b.row.score - a.row.score ||
        a.row.day.localeCompare(b.row.day),
    );
  const checks = watch.map((row) => Date.parse(row.checked_at)).filter(Number.isFinite);
  const checkedAt = checks.length === 0 ? null : new Date(Math.max(...checks));
  return {
    days: forecastDays(snapshots, today),
    watch: entries,
    allClear: entries.every((entry) => entry.status === 'go' || entry.status === 'set'),
    checkedAt,
    stale: checkedAt !== null && now.getTime() - checkedAt.getTime() > STALE_AFTER_MS,
  };
}
