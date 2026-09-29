import { NativeModule, requireOptionalNativeModule } from 'expo';

/** One date as the native reduction returns it (Swift `DayState` / Kotlin `DayState`). */
export interface NativeDayState {
  readonly date: string;
  readonly state: string;
}

/**
 * The native binding (Swift `CpCalendarModule` / Kotlin `CpCalendarModule`).
 * `requireOptionalNativeModule` resolves to `null` in a build without it (Jest, or a binary built
 * before the module existed); setup then offers marking days by hand instead.
 */
export declare class NativeCpCalendarModule extends NativeModule {
  hasAccess(): boolean;
  /** Rejects with `ERR_CALENDAR_ACCESS` without calendar access. */
  readBusyDays(
    from: string,
    to: string,
    tz: string,
    includeTentative: boolean,
  ): Promise<NativeDayState[]>;
}

export const nativeCpCalendarModule =
  requireOptionalNativeModule<NativeCpCalendarModule>('CpCalendar');
