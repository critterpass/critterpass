/**
 * Wall-clock dates and times in a time zone, for the booking form: a zone's offset and its name
 * for the traveller, a typed day and time as an ISO instant with the zone's offset, an instant back
 * as the wall clock, and the zones a flight's two times are read in (each airport's own).
 */
/* eslint-disable lingui/no-unlocalized-strings -- date patterns and zone ids, never copy. */
import { airportZone } from '@cp/content/airports';
import { clockOption } from '@/lib/i18n/formats';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/u;

/** The zones a flight's two times are read in: each airport's own, else the booking's. */
export function flightZones(
  draft: { readonly from: string; readonly to: string },
  tz: string,
): { readonly dep: string; readonly arr: string } {
  const dep = airportZone(draft.from) ?? tz;
  return { dep, arr: airportZone(draft.to) ?? dep };
}

/** Minutes east of UTC that `tz` observes at `utcMs`. */
export function offsetMinutes(tz: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    ...clockOption(),
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

/**
 * How the form names the zone its times are read in: the zone's city and its offset now
 * ("Ho Chi Minh", "GMT+7"; "Kolkata", "GMT+5:30").
 */
export function zoneName(tz: string, utcMs: number): { city: string; offset: string } {
  const minutes = offsetMinutes(tz, utcMs);
  const abs = Math.abs(minutes);
  const rest = abs % 60 === 0 ? '' : `:${String(abs % 60).padStart(2, '0')}`;
  return {
    city: (tz.split('/').pop() ?? tz).replace(/_/gu, ' '),
    offset: `GMT${minutes < 0 ? '-' : '+'}${String(Math.floor(abs / 60))}${rest}`,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** "2026-10-12" + "09:05" in Asia/Singapore → "2026-10-12T09:05:00+08:00"; null when unreadable. */
export function zonedIso(date: string, time: string, tz: string): string | null {
  const d = DATE.exec(date.trim());
  const t = TIME.exec((time.trim() === '' ? '00:00' : time).trim());
  if (d === null || t === null) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2])];
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(wall).getUTCDate() !== day) return null;
  let offset = offsetMinutes(tz, wall);
  offset = offsetMinutes(tz, wall - offset * 60_000);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${String(year)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** The wall-clock date and time of an instant in `tz`. */
export function wallOf(iso: string | null, tz: string): { date: string; time: string } {
  if (iso === null) return { date: '', time: '' };
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { date: '', time: '' };
  const local = new Date(ms + offsetMinutes(tz, ms) * 60_000);
  return {
    date: `${String(local.getUTCFullYear())}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
  };
}
