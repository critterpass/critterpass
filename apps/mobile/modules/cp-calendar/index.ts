/**
 * Date-level availability from the device's calendars. The events are read and reduced on the
 * device (the same rule as the server's `reduceToDays`): what reaches JS is one free / maybe /
 * busy per local date, never a title, attendee, place or time. `maybe` appears only when the
 * member chose to share tentative events.
 */
import { nativeCpCalendarModule } from './src/CpCalendarModule';

export type DeviceDayState = 'free' | 'maybe' | 'busy';

export interface DeviceDay {
  readonly date: string;
  readonly state: DeviceDayState;
}

export interface DayRange {
  /** First and last local dates, `YYYY-MM-DD`, inclusive. */
  readonly from: string;
  readonly to: string;
  /** The member's IANA zone: dates are theirs. */
  readonly tz: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const STATES: readonly string[] = ['free', 'maybe', 'busy'];

/** False in a binary built without the module: setup offers marking days by hand. */
export function isDeviceCalendarAvailable(): boolean {
  return nativeCpCalendarModule !== null;
}

/** Whether the app may read the calendars now (full access on iOS, READ_CALENDAR on Android). */
export function hasCalendarAccess(): boolean {
  return nativeCpCalendarModule?.hasAccess() ?? false;
}

/**
 * One state per date in `range`; [] without the module. Only well-formed `{date, state}` pairs
 * are kept (and nothing else of them), so the result is safe to send as it is.
 */
export async function readBusyDays(
  range: DayRange,
  includeTentative: boolean,
): Promise<DeviceDay[]> {
  if (nativeCpCalendarModule === null) return [];
  const days = await nativeCpCalendarModule.readBusyDays(
    range.from,
    range.to,
    range.tz,
    includeTentative,
  );
  return days
    .filter((day) => DATE.test(day.date) && STATES.includes(day.state))
    .filter((day) => includeTentative || day.state !== 'maybe')
    .map((day) => ({ date: day.date, state: day.state as DeviceDayState }));
}
