/**
 * Forecast impact scoring for the watch list (3k-7), all in code: for each plan item the forecast
 * can hurt, the worst hour of its window is read against fixed thresholds (waves ≥ 2 m or wind
 * ≥ 30 km/h on a boat, wind on a summit, rain chance ≥ 60 % on an outdoor item, volcano level ≥ 3
 * for a summit or a boat, crowds ≥ 80 at the place). The ratio to the threshold sets the status:
 * - PLAN B: a threshold is crossed and the item starts within {@link CONFIDENT_HOURS};
 * - WATCHING: crossed further out (forecasts move), or within a quarter of a threshold; crowds
 *   alone never go past WATCHING;
 * - GO: nothing near a threshold;
 * - SET stays SET (the crew already decided) until the risk is gone.
 * Only an escalation into PLAN B pings anyone ({@link isPlanChangingEscalation}).
 */
import type { MarineHour, WatchKind, WatchStatus, WeatherHour } from '@cp/domain';

export const WAVE_LIMIT_M = 2;
export const WIND_LIMIT_KMH = 30;
export const RAIN_LIMIT_PCT = 60;
export const VOLCANO_LIMIT_LEVEL = 3;
export const CROWD_LIMIT = 80;
/** Forecasts closer than this are acted on; further out they are watched. */
export const CONFIDENT_HOURS = 72;
const NEAR = 0.75;
const HOUR_MS = 3_600_000;

export interface WatchSubject {
  readonly stableId: string;
  readonly title: string;
  /** Local date of the item. */
  readonly day: string;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly outdoor: boolean;
  readonly marine: boolean;
  readonly summit: boolean;
}

export interface WatchSignals {
  readonly weather: readonly WeatherHour[];
  readonly marine: readonly MarineHour[];
  readonly volcanoLevel: number | null;
  /** 0–100 at the item's hour (BestTime), when known. */
  readonly crowd: number | null;
}

export interface WatchVerdict {
  readonly kind: WatchKind;
  readonly status: WatchStatus;
  readonly score: number;
  readonly reasons: readonly string[];
  /** The numbers the copy may show, as displayed ("2.5", "35", "70", "3"). */
  readonly facts: Readonly<Record<string, string | number>>;
  readonly titleTemplate: string;
  readonly detailTemplate: string;
}

function window<T extends { at: string }>(hours: readonly T[], subject: WatchSubject): T[] {
  const start = subject.startsAt.getTime();
  const end = subject.endsAt?.getTime() ?? start + HOUR_MS;
  return hours.filter((hour) => {
    const at = Date.parse(hour.at);
    return at + HOUR_MS > start && at < end;
  });
}

const peak = (values: readonly number[]): number | null =>
  values.length === 0 ? null : Math.max(...values);

const round1 = (value: number): string => (Math.round(value * 10) / 10).toFixed(1);

interface Metric {
  readonly reason: 'waves' | 'wind' | 'rain' | 'volcano' | 'crowds';
  readonly kind: WatchKind;
  readonly ratio: number;
}

export function scoreWatch(
  subject: WatchSubject,
  signals: WatchSignals,
  now: Date,
  previous: WatchStatus | null = null,
): WatchVerdict | null {
  const hours = window(signals.weather, subject);
  const sea = window(signals.marine, subject);
  const facts: Record<string, string | number> = { title: subject.title };
  const metrics: Metric[] = [];
  const waves = peak(sea.map((hour) => hour.wave_m));
  const wind = peak(hours.map((hour) => Math.max(hour.wind_kph, hour.gust_kph)));
  const rain = peak(hours.map((hour) => hour.chance_of_rain));
  if (subject.marine && waves !== null) {
    facts['waves_m'] = round1(waves);
    metrics.push({ reason: 'waves', kind: 'marine', ratio: waves / WAVE_LIMIT_M });
  }
  if ((subject.marine || subject.summit) && wind !== null) {
    facts['wind_kmh'] = Math.round(wind);
    metrics.push({
      reason: 'wind',
      kind: subject.marine ? 'marine' : 'weather',
      ratio: wind / WIND_LIMIT_KMH,
    });
  }
  if (subject.outdoor && rain !== null) {
    facts['rain_pct'] = Math.round(rain);
    metrics.push({ reason: 'rain', kind: 'weather', ratio: rain / RAIN_LIMIT_PCT });
  }
  if ((subject.summit || subject.marine) && signals.volcanoLevel !== null) {
    facts['volcano_level'] = signals.volcanoLevel;
    metrics.push({
      reason: 'volcano',
      kind: 'volcano',
      ratio: signals.volcanoLevel / VOLCANO_LIMIT_LEVEL,
    });
  }
  const crowd = signals.crowd;
  if (crowd !== null) {
    facts['crowd'] = Math.round(crowd);
    // Crowds are worth a look, never a plan change.
    metrics.push({ reason: 'crowds', kind: 'crowds', ratio: Math.min(crowd / CROWD_LIMIT, 0.99) });
  }
  if (metrics.length === 0) return null;
  const worst = metrics.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const hoursAway = (subject.startsAt.getTime() - now.getTime()) / HOUR_MS;
  const crossed = metrics.filter((metric) => metric.ratio >= 1);
  let status: WatchStatus;
  if (crossed.length > 0) status = hoursAway <= CONFIDENT_HOURS ? 'plan_b' : 'watching';
  else if (worst.ratio >= NEAR) status = 'watching';
  else status = 'go';
  if (previous === 'set' && status !== 'go') status = 'set';
  const reasons = (crossed.length > 0 ? crossed : [worst]).map((metric) => metric.reason);
  return {
    kind: worst.kind,
    status,
    score: Math.min(100, Math.round(worst.ratio * 70)),
    reasons,
    facts,
    titleTemplate: titleFor(subject, worst.reason, facts),
    detailTemplate: detailFor(subject, reasons, facts, status),
  };
}

function titleFor(
  subject: WatchSubject,
  reason: Metric['reason'],
  facts: Readonly<Record<string, string | number>>,
): string {
  switch (reason) {
    case 'waves':
      return `${subject.title} · waves ${String(facts['waves_m'])} m`;
    case 'wind':
      return `${subject.title} · wind ${String(facts['wind_kmh'])} km/h`;
    case 'rain':
      return `${subject.title} · ${String(facts['rain_pct'])}% rain`;
    case 'volcano':
      return `${subject.title} · volcano level ${String(facts['volcano_level'])}`;
    case 'crowds':
      return `${subject.title} · busy`;
  }
}

function detailFor(
  subject: WatchSubject,
  reasons: readonly string[],
  facts: Readonly<Record<string, string | number>>,
  status: WatchStatus,
): string {
  const parts: string[] = [];
  if (reasons.includes('waves')) parts.push(`waves ${String(facts['waves_m'])} m`);
  if (reasons.includes('wind')) parts.push(`wind ${String(facts['wind_kmh'])} km/h`);
  if (reasons.includes('rain')) parts.push(`${String(facts['rain_pct'])}% chance of rain`);
  if (reasons.includes('volcano'))
    parts.push(`volcano alert level ${String(facts['volcano_level'])}`);
  if (reasons.includes('crowds')) parts.push('busier than usual');
  const what = parts.join(', ');
  if (status === 'plan_b') {
    return subject.marine
      ? `Forecast shows ${what}. The harbour might close.`
      : `Forecast shows ${what}. Worth a plan B.`;
  }
  if (status === 'watching') return `Forecast shows ${what}. Keeping an eye on it.`;
  if (status === 'set') return `Plan B is set. Forecast still shows ${what}.`;
  return `Looks fine for ${subject.title}.`;
}
