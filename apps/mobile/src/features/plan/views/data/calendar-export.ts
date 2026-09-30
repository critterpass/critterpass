/**
 * Calendar export (F-083): my plan items as calendar events, written straight to the phone's
 * calendar when the installed build's `cp-calendar` module can write (write-only access), and the
 * subscribable feed (`create_calendar_feed` → `webcal://…/v1/trips/{id}/calendar.ics?token`) that
 * follows every plan change; `revoke_calendar_feed` turns every live link off.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, URL schemes and wire values. */
import { createContext, useContext } from 'react';

import type { CalendarFeedIssued } from '@cp/domain';

import { defineClientCommand } from '@/data/commands/summaries';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import type { PlanItem } from '../../overview/model/plan-model';

export const CREATE_CALENDAR_FEED = defineClientCommand<{ trip_id: string }>({
  name: 'create_calendar_feed',
  offline: false,
});

export const REVOKE_CALENDAR_FEED = defineClientCommand<{ trip_id: string }>({
  name: 'revoke_calendar_feed',
  offline: false,
});

/** One event as the native writer takes it (same shape on iOS and Android). */
export interface DeviceCalendarEvent {
  /** The item's `stable_id`: kept in the event's URL so it points back at the plan. */
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly tz: string;
  readonly notes: string | null;
}

/** The write methods a build with calendar writing adds to `cp-calendar`. */
export interface CalendarWriter {
  requestWriteAccess(): Promise<boolean>;
  writeEvents(events: readonly DeviceCalendarEvent[]): Promise<number>;
}

/** The installed build's writer, or null when it predates calendar writing (subscribe instead). */
export function calendarWriter(module: unknown): CalendarWriter | null {
  const candidate = module as Partial<CalendarWriter> | null;
  return candidate !== null &&
    typeof candidate.writeEvents === 'function' &&
    typeof candidate.requestWriteAccess === 'function'
    ? (candidate as CalendarWriter)
    : null;
}

const HOUR_MS = 60 * 60 * 1000;

/** My timed items as events: those I attend (nobody named means everyone), an hour when open-ended. */
export function myEvents(
  items: readonly PlanItem[],
  uid: string,
  tripTz: string | null,
): DeviceCalendarEvent[] {
  return items.flatMap((item) => {
    if (item.startsAt === null || item.label === null) return [];
    if (item.attendeeIds.length > 0 && !item.attendeeIds.includes(uid)) return [];
    const start = Date.parse(item.startsAt);
    if (Number.isNaN(start)) return [];
    const end = item.endsAt === null ? Number.NaN : Date.parse(item.endsAt);
    return [
      {
        id: item.stableId,
        title: item.label,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(Number.isNaN(end) || end <= start ? start + HOUR_MS : end).toISOString(),
        tz: item.tz ?? tripTz ?? 'UTC',
        notes: null,
      },
    ];
  });
}

/** The feed's https URL (for copying) and its `webcal://` twin (for the calendar app). */
export function feedUrls(
  issued: CalendarFeedIssued,
  apiBase: string = resolveApiBaseUrl(),
): {
  readonly https: string;
  readonly webcal: string;
} {
  const https = `${apiBase.replace(/\/$/u, '')}${issued.path}`;
  return { https, webcal: https.replace(/^https?:/u, 'webcal:') };
}

const CalendarWriterContext = createContext<CalendarWriter | null>(null);

/** The route hands the native module's writer down (features never import native modules). */
export const CalendarWriterProvider = CalendarWriterContext.Provider;

export function useCalendarWriter(): CalendarWriter | null {
  return useContext(CalendarWriterContext);
}
