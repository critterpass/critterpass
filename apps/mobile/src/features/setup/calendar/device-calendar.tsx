/**
 * The device calendar as setup sees it: whether this build has the on-device reader, whether the
 * app may read the calendars now, and the date-level states it returns (modules/cp-calendar; the
 * route layer passes the module in, since features never import native modules). Without a
 * provider, or in a build without the module, only marking days by hand is offered.
 */
import { createContext, useContext, type ReactNode } from 'react';

export type DeviceDayState = 'free' | 'maybe' | 'busy';

export interface DeviceCalendar {
  readonly isAvailable: () => boolean;
  readonly hasAccess: () => boolean;
  /** One state per local date in `[from, to]`; rejects without access. */
  readonly readBusyDays: (
    range: { readonly from: string; readonly to: string; readonly tz: string },
    includeTentative: boolean,
  ) => Promise<readonly { readonly date: string; readonly state: DeviceDayState }[]>;
}

const DeviceCalendarContext = createContext<DeviceCalendar | null>(null);

export function DeviceCalendarProvider({
  calendar,
  children,
}: {
  readonly calendar: DeviceCalendar;
  readonly children: ReactNode;
}) {
  return (
    <DeviceCalendarContext.Provider value={calendar}>{children}</DeviceCalendarContext.Provider>
  );
}

/** The device calendar, or null when this build or screen has none. */
export function useDeviceCalendar(): DeviceCalendar | null {
  const calendar = useContext(DeviceCalendarContext);
  return calendar !== null && calendar.isAvailable() ? calendar : null;
}
