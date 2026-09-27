/**
 * Device-local calendar day keys (docs/product-decisions.md D8/C47: "reset 00:00 device tz").
 * Built on `Temporal` (docs/code-standards.md §2: "never `new Date()` arithmetic for local days") so
 * a DST transition or an unusual UTC offset never shifts the reported calendar date by an hour.
 * `periodKey`/`periodResetAt` are the one place both the server (real reset enforcement) and the
 * client (offline meter countdown over synced `usage_counters` rows) compute a device-tz day, so the
 * two can never disagree on where the boundary falls.
 */
import { Temporal } from '@js-temporal/polyfill';
import { isIanaTimeZone } from '@cp/domain';

function assertIanaTimeZone(deviceTz: string): void {
  // `isIanaTimeZone` narrows `unknown -> string`; called with an already-`string` argument, that
  // narrowing would make the `false` branch below unreachable (`never`) if checked inline, so the
  // result is captured as a plain boolean first.
  const valid: boolean = isIanaTimeZone(deviceTz);
  if (!valid) {
    throw new RangeError(`periodKey: "${deviceTz}" is not a valid IANA time zone`);
  }
}

/**
 * The device-local calendar date (`YYYY-MM-DD`) `instant` falls on on in `deviceTz` — the
 * `period_key` a guide answer, redraft or fair-use bump is filed under. Two instants a few minutes
 * apart can land on different period keys near midnight; the same instant can land on different
 * period keys for two device timezones (a crew spread across countries) — both are correct, by
 * design (D8: the meter is per-device-tz, not per-server-day).
 */
export function periodKey(instant: Date, deviceTz: string): string {
  assertIanaTimeZone(deviceTz);
  return Temporal.Instant.fromEpochMilliseconds(instant.getTime())
    .toZonedDateTimeISO(deviceTz)
    .toPlainDate()
    .toString();
}

/**
 * The instant `periodKeyValue` resets at: 00:00:00 wall-clock in `deviceTz` on the calendar day
 * after the key. Computed as a `ZonedDateTime` (not `Date.UTC` + a fixed offset guess) so a period
 * that ends on the day a DST transition happens still resets at the true local midnight, whether
 * that local day was 23 or 25 hours long.
 */
export function periodResetAt(periodKeyValue: string, deviceTz: string): Date {
  assertIanaTimeZone(deviceTz);
  const resetDate = Temporal.PlainDate.from(periodKeyValue).add({ days: 1 });
  const resetInstant = resetDate.toZonedDateTime(deviceTz).toInstant();
  return new Date(resetInstant.epochMilliseconds);
}
