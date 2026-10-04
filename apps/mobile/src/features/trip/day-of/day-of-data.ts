/**
 * The day-of screen's pieces derived from rows: which leave-by leads the screen, the point
 * forecast for the top ("9° at the top"), the timeline entries and the alarm line under the hero.
 */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';

import type { GoTarget } from '@/features/go';

import type { AlarmAuthorization } from '../alarm/alarm-port';
import type { AlarmSheetKind } from '../alarm/alarm-permission-sheet';
import type { AlarmStatus } from '../alarm/alarm-store';
import type { DayItemRow } from '../hub/data/queries';
import {
  clockIn,
  parseIdList,
  parseJson,
  type CrewMember,
  type LeaveByView,
} from '../leave-by/model';
import type { DayTimelineEntry } from './timeline';

/** A point this high up reads "at the top". */
const SUMMIT_M = 1000;

/** The next leave-by still to go, else the last one of the day (it shows "on the way"). */
export function pickLeaveBy(views: readonly LeaveByView[]): LeaveByView | null {
  return views.find((view) => view.phase !== 'transit') ?? views[views.length - 1] ?? null;
}

interface WeatherRow {
  readonly elevation_m: number | null;
  readonly hourly: string | null;
}

/** The highest point's temperature at the hour nearest `at` (or the day's low without one). */
export function forecastFor(
  rows: readonly WeatherRow[],
  at: Date | null,
): { readonly tempC: number; readonly atTheTop: boolean } | null {
  const top = [...rows].sort((a, b) => (b.elevation_m ?? 0) - (a.elevation_m ?? 0))[0];
  if (top === undefined) return null;
  const body = parseJson<{
    day?: { min_temp_c?: number };
    hours?: { at: string; temp_c: number }[];
  } | null>(top.hourly, null);
  if (body === null) return null;
  const atTheTop = (top.elevation_m ?? 0) >= SUMMIT_M;
  const hours = body.hours ?? [];
  if (at !== null && hours.length > 0) {
    const nearest = [...hours].sort(
      (a, b) =>
        Math.abs(new Date(a.at).getTime() - at.getTime()) -
        Math.abs(new Date(b.at).getTime() - at.getTime()),
    )[0];
    if (nearest !== undefined) return { tempC: nearest.temp_c, atTheTop };
  }
  const low = body.day?.min_temp_c;
  return typeof low === 'number' ? { tempC: low, atTheTop } : null;
}

export interface TimelineEntryData extends DayTimelineEntry {
  readonly bookingId: string | null;
  readonly startsAt: Date;
  readonly poiId?: string | null | undefined;
}

/** What leads a day with no leave-by: its first stop, today's next stop, or nothing left today. */
export type DayLead =
  | {
      readonly kind: 'first' | 'next';
      readonly time: string;
      readonly title: string;
      /** The stop's place, when it has one (GO opens on it). */
      readonly poiId?: string | null | undefined;
    }
  | { readonly kind: 'done' };

/**
 * The stop the quiet hero shows. Another day leads with its first stop. Today leads with the next
 * stop still ahead, and says the day is done once the last one has started; a day with no stops is
 * a free day (null).
 */
export function dayLead(
  timeline: readonly TimelineEntryData[],
  isToday: boolean,
  now: Date,
): DayLead | null {
  const first = timeline[0];
  if (first === undefined) return null;
  if (!isToday) return { kind: 'first', time: first.time, title: first.title, poiId: first.poiId };
  const next = timeline.find((entry) => entry.startsAt.getTime() > now.getTime());
  if (next === undefined) return { kind: 'done' };
  return {
    kind: next === first ? 'first' : 'next',
    time: next.time,
    title: next.title,
    poiId: next.poiId,
  };
}

/**
 * What GO may open from today's day-of screen, first choice first: the leave-by's stop (a flight's
 * is its departure airport), then the next stop with a place. The screen offers the first one GO
 * can place. Nothing on another day or once the day is done.
 */
export function dayOfGo(
  leaveBy: LeaveByView | null,
  lead: DayLead | null,
  tripId: string,
  isToday: boolean,
): { readonly leaveBy: GoTarget | null; readonly stop: GoTarget | null } {
  if (!isToday) return { leaveBy: null, stop: null };
  return {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a target kind, never copy.
    leaveBy: leaveBy === null ? null : { kind: 'leave_by', leaveById: leaveBy.id },
    stop:
      lead === null || lead.kind === 'done' || !lead.poiId
        ? null
        : { kind: 'place', poiId: lead.poiId, tripId },
  };
}

/** How the day shown sits against the trip's own today. */
export function dayRelation(localDate: string, today: string): 'today' | 'tomorrow' | 'other' {
  if (localDate === today) return 'today';
  // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time suffix, never copy.
  const next = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return localDate === next ? 'tomorrow' : 'other';
}

function titleOf(row: DayItemRow): string {
  return row.poi_name ?? row.notes ?? row.category ?? t({ id: 'trip.dayOf.item', message: 'Plan' });
}

export function dayTimeline(
  rows: readonly DayItemRow[],
  me: string | null,
  members: readonly CrewMember[],
  locale: string,
  tripTz: string,
): TimelineEntryData[] {
  const names = new Map(members.map((member) => [member.id, member.name]));
  return rows
    .filter((row) => row.starts_at !== null)
    .map((row) => {
      const attendees = parseIdList(row.attendee_ids);
      const mine = attendees.length === 0 || (me !== null && attendees.includes(me));
      const detail = !mine
        ? format.list(
            locale,
            attendees.map((id) => names.get(id) ?? '').filter((name) => name !== ''),
            { type: 'conjunction' },
          )
        : row.booking_id !== null
          ? t({ id: 'trip.dayOf.ticketsInBookings', message: 'Tickets in Bookings' })
          : row.poi_name !== null && row.notes !== null
            ? row.notes
            : null;
      return {
        id: row.stable_id,
        time: clockIn(new Date(row.starts_at ?? ''), row.tz ?? tripTz, locale),
        title: titleOf(row),
        detail: detail === '' ? null : detail,
        dimmed: !mine,
        bookingId: mine ? row.booking_id : null,
        startsAt: new Date(row.starts_at ?? ''),
        poiId: row.poi_id ?? null,
      };
    });
}

export interface AlarmNoteData {
  readonly text: string;
  readonly actionLabel: string | null;
  readonly sheet: AlarmSheetKind | null;
}

/** The line under the hero saying how my alarm will ring, with what to do about it. */
export function alarmNoteFor(
  view: LeaveByView | null,
  status: AlarmStatus,
  nativeAuthorization: AlarmAuthorization | null,
  locale: string,
): AlarmNoteData | null {
  if (view === null || !view.viewerIn || view.viewerUp) return null;
  if (view.phase === 'transit' || view.phase === 'overdue') return null;
  const at = clockIn(view.alarmAt, view.tz, locale);
  if (status.mode === 'native') {
    return status.engine === 'inexact'
      ? {
          text: t({
            id: 'trip.alarm.note.inexact',
            message: `Your alarm is set for ${at}. It may ring a few minutes late.`,
          }),
          actionLabel: t({ id: 'trip.alarm.note.exactAction', message: 'Ring on the minute' }),
          sheet: 'exact',
        }
      : {
          text: t({ id: 'trip.alarm.note.set', message: `Your alarm is set for ${at}.` }),
          actionLabel: null,
          sheet: null,
        };
  }
  if (status.mode === 'notification') {
    const text = t({
      id: 'trip.alarm.note.notification',
      message: `You'll get a notification at ${at}, not an alarm.`,
    });
    if (nativeAuthorization === 'notDetermined') {
      return {
        text,
        actionLabel: t({ id: 'trip.alarm.note.askAction', message: 'Make it an alarm' }),
        sheet: 'ask',
      };
    }
    if (nativeAuthorization === 'denied') {
      return {
        text,
        actionLabel: t({ id: 'trip.alarm.note.deniedAction', message: 'Turn alarms on' }),
        sheet: 'denied',
      };
    }
    return {
      text,
      actionLabel: t({ id: 'trip.alarm.note.whyAction', message: 'Why not an alarm?' }),
      sheet: 'notification',
    };
  }
  return {
    text: t({
      id: 'trip.alarm.note.inApp',
      message: 'Alarms are off on this phone. It rings here only while the app is open.',
    }),
    actionLabel: t({ id: 'trip.alarm.note.deniedAction', message: 'Turn alarms on' }),
    sheet: status.denied ? 'denied' : 'ask',
  };
}
