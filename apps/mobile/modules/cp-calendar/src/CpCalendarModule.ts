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
/** One plan item to add (Swift `PlanEventRecord` / Kotlin `PlanEventRecord`). */
export interface NativePlanEvent {
  readonly id: string;
  readonly title: string;
  /** ISO 8601 instants. */
  readonly startsAt: string;
  readonly endsAt: string;
  /** IANA zone the event shows in. */
  readonly tz: string;
  readonly notes: string | null;
}

export declare class NativeCpCalendarModule extends NativeModule {
  hasAccess(): boolean;
  /** Rejects with `ERR_CALENDAR_ACCESS` without calendar access. */
  readBusyDays(
    from: string,
    to: string,
    tz: string,
    includeTentative: boolean,
  ): Promise<NativeDayState[]>;
  /** Write-only access on iOS 17+; READ_CALENDAR + WRITE_CALENDAR on Android (to pick a calendar). */
  requestWriteAccess(): Promise<boolean>;
  /** Adds the events, reading none back; resolves with how many were written. */
  writeEvents(events: readonly NativePlanEvent[]): Promise<number>;
}

export const nativeCpCalendarModule =
  requireOptionalNativeModule<NativeCpCalendarModule>('CpCalendar');
