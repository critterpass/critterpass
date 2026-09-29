/**
 * Bookings jobs: the free-cancellation reminder. Registering them also wires the bookings area's
 * pushes, its retention rules and the countdown's flight source into this process.
 */
import type { AssertRouteOn, Telemetry } from '@cp/ai';
import { registerFlightSegmentsSource } from '@cp/domain';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../boss';
import { registerRetentionRule } from '../maint/retention-rules';
import { deadlineReminderJob, registerDeadlinePush } from './deadline-reminder';
import { bookingFlightSegments } from './flight-segments-source';

/** The worker env keys this area reads (the DeepSeek key for the extractor, R2 for raw mail). */
export interface BookingsJobsEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
}

let wired = false;

/** Pushes, retention and ports: once per process. */
function wireBookings(): void {
  if (wired) return;
  wired = true;
  registerDeadlinePush();
  registerFlightSegmentsSource(bookingFlightSegments);
  // A resolved candidate is kept 30 days after its decision; inbound mail metadata 90 days.
  registerRetentionRule({
    kind: 'direct',
    table: 'import_candidates',
    column: 'resolved_at',
    ttlDays: 30,
    where: 'resolved_at IS NOT NULL',
  });
  registerRetentionRule({
    kind: 'direct',
    table: 'inbound_emails',
    column: 'created_at',
    ttlDays: 90,
  });
}

export function bookingsJobs(
  env: BookingsJobsEnv,
  pool: pg.Pool,
  assertRouteOn: AssertRouteOn,
  telemetry?: Telemetry,
): AnyJobDefinition[] {
  void env;
  void pool;
  void assertRouteOn;
  void telemetry;
  wireBookings();
  return [deadlineReminderJob()];
}
