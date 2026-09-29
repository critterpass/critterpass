/**
 * Calendar sources for setup (docs/api-contracts.md §4.5): the OAuth providers' endpoints and
 * scopes (free/busy only, never event details), and the one reduction every source goes through,
 * device and server alike: busy intervals in, one date-level state per local date out. A day is
 * `busy` when busy time covers at least three waking hours (08:00–22:00) or an all-day busy block;
 * `maybe` when tentative time does and the member opted in to share tentative as "maybe busy";
 * otherwise `free`. Titles, attendees and times never leave the reduction.
 */
import { localSchedule, toLocalWallTime } from '../time/local-schedule';
import { type OAuthCalendarProvider } from './availability';

export interface CalendarProviderSpec {
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  /** `null` when the provider has no token revocation endpoint (Microsoft). */
  readonly revokeUrl: string | null;
  readonly scopes: readonly string[];
  /** Extra authorize parameters (offline access, forced consent). */
  readonly authorizeParams: Readonly<Record<string, string>>;
}

export const CALENDAR_PROVIDERS: Readonly<Record<OAuthCalendarProvider, CalendarProviderSpec>> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    scopes: ['https://www.googleapis.com/auth/calendar.freebusy'],
    authorizeParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false' },
  },
  microsoft: {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    revokeUrl: null,
    scopes: ['offline_access', 'Calendars.ReadBasic'],
    authorizeParams: { response_mode: 'query' },
  },
};

export const GOOGLE_FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';
/** Graph calendar view, asked for `showAs`, times and all-day only (never subject or people). */
export const MICROSOFT_CALENDAR_VIEW_URL = 'https://graph.microsoft.com/v1.0/me/calendarView';
export const MICROSOFT_CALENDAR_VIEW_SELECT = 'showAs,start,end,isAllDay';

/** The flag that shows a provider's connect row (off until its verification lands). */
export function calendarOAuthFlag(
  provider: OAuthCalendarProvider,
): 'calendar.oauth_google' | 'calendar.oauth_microsoft' {
  return provider === 'google' ? 'calendar.oauth_google' : 'calendar.oauth_microsoft';
}

export interface BusyInterval {
  readonly start: Date;
  readonly end: Date;
  readonly status: 'busy' | 'tentative';
  readonly allDay?: boolean;
}

export interface ReduceOptions {
  /** First and last local dates (`YYYY-MM-DD`, inclusive). */
  readonly from: string;
  readonly to: string;
  /** The member's zone: dates are theirs, not the server's. */
  readonly tz: string;
  readonly includeTentative: boolean;
  readonly minBusyMinutes?: number;
}

const WAKING_START = '08:00';
const WAKING_END = '22:00';
export const MIN_BUSY_MINUTES = 180;

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function overlapMinutes(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / 60_000;
}

/** One state per local date in `[from, to]`, from busy and tentative intervals. */
export function reduceToDays(
  intervals: readonly BusyInterval[],
  options: ReduceOptions,
): Map<string, 'free' | 'maybe' | 'busy'> {
  const min = options.minBusyMinutes ?? MIN_BUSY_MINUTES;
  const days = new Map<string, 'free' | 'maybe' | 'busy'>();
  for (let date = options.from; date <= options.to; date = nextDate(date)) {
    const start = localSchedule({ date, time: WAKING_START, tz: options.tz }).getTime();
    const end = localSchedule({ date, time: WAKING_END, tz: options.tz }).getTime();
    let busy = 0;
    let tentative = 0;
    let allDayBusy = false;
    let allDayTentative = false;
    for (const interval of intervals) {
      const minutes = overlapMinutes(start, end, interval.start.getTime(), interval.end.getTime());
      if (minutes <= 0) continue;
      const allDay = interval.allDay === true;
      if (interval.status === 'busy') {
        busy += minutes;
        allDayBusy ||= allDay;
      } else {
        tentative += minutes;
        allDayTentative ||= allDay;
      }
    }
    if (allDayBusy || busy >= min) days.set(date, 'busy');
    else if (options.includeTentative && (allDayTentative || tentative >= min)) {
      days.set(date, 'maybe');
    } else days.set(date, 'free');
  }
  return days;
}

/** The member's local date for an instant (so "today" is theirs). */
export function localDateOf(at: Date, tz: string): string {
  return toLocalWallTime(at, tz).date;
}
