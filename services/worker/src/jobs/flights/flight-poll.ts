/**
 * `flight.poll` (the `scheduled_events` timers a watched flight arms at T−72 h, T−24 h, T−6 h and
 * T−3 h): the schedule check. At T−72 h, with AeroAPI configured, the flight's alert is registered
 * (one watch row per segment; the alert then pushes changes as they happen). Each check reads the
 * flight from AeroAPI, or AeroDataBox when AeroAPI is not configured, and applies it. With neither
 * configured the card keeps its scheduled times and the traveller's own "landed".
 */
import { scheduledJobDataSchema, withSystem, type ScheduledJobData } from '@cp/db';
import { BOOKINGS_QUEUES, toLocalWallTime } from '@cp/domain';
import type { AeroApiClient, AeroDataBoxClient, FlightSnapshot } from '@cp/suppliers';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { applyReading, readingMatches } from './apply';
import { syncLaPhase } from './snapshot';

export interface FlightProviders {
  readonly aero?: AeroApiClient | undefined;
  readonly adb?: AeroDataBoxClient | undefined;
}

interface PolledSegment {
  readonly id: string;
  readonly carrier: string;
  readonly flight_no: string;
  readonly dep_airport: string;
  readonly arr_airport: string;
  readonly sched_dep_at: Date;
  readonly sched_arr_at: Date | null;
  readonly status: string;
  readonly tz: string | null;
  readonly alert: string | null;
}

async function registerAlert(
  pool: pg.Pool,
  aero: AeroApiClient,
  segment: PolledSegment,
): Promise<void> {
  if (segment.alert !== null) return;
  const alertId = await aero.createAlert({
    ident: `${segment.carrier}${segment.flight_no}`,
    origin: segment.dep_airport,
    destination: segment.arr_airport,
    start: new Date(segment.sched_dep_at.getTime() - 86_400_000).toISOString().slice(0, 10),
    end: new Date(segment.sched_dep_at.getTime() + 2 * 86_400_000).toISOString().slice(0, 10),
  });
  const until = new Date((segment.sched_arr_at ?? segment.sched_dep_at).getTime() + 2 * 86_400_000);
  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO flight_watches (flight_segment_id, provider, provider_alert_id, active_until)
       VALUES ($1, 'flightaware', $2, $3)
       ON CONFLICT (flight_segment_id, provider) DO UPDATE
         SET provider_alert_id = EXCLUDED.provider_alert_id, active_until = EXCLUDED.active_until,
             ended_at = NULL`,
      [segment.id, alertId, until],
    ),
  );
}

async function readingFor(
  providers: FlightProviders,
  segment: PolledSegment,
): Promise<FlightSnapshot | null> {
  const day = (offset: number) =>
    new Date(segment.sched_dep_at.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  const readings = providers.aero
    ? await providers.aero.flightsByIdent(`${segment.carrier}${segment.flight_no}`, day(-1), day(2))
    : providers.adb
      ? await providers.adb.flightsOn(
          segment.carrier,
          segment.flight_no,
          toLocalWallTime(segment.sched_dep_at, segment.tz ?? 'UTC').date,
        )
      : [];
  return readings.find((reading) => readingMatches(segment, reading)) ?? null;
}

export async function pollFlight(
  pool: pg.Pool,
  providers: FlightProviders,
  timer: Pick<ScheduledJobData, 'ref_id' | 'slot'>,
  now: Date,
): Promise<{ outcome: 'polled' | 'skipped'; changes: number }> {
  const segment = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<PolledSegment>(
      `SELECT s.id, s.carrier, s.flight_no, s.dep_airport, s.arr_airport, s.sched_dep_at,
              s.sched_arr_at, s.status, b.tz,
              (SELECT w.provider_alert_id FROM flight_watches w
                WHERE w.flight_segment_id = s.id AND w.provider = 'flightaware' AND w.ended_at IS NULL) AS alert
         FROM flight_segments s JOIN bookings b ON b.id = s.booking_id
        WHERE s.id = $1 AND b.deleted_at IS NULL`,
      [timer.ref_id],
    );
    return rows[0];
  });
  if (segment === undefined || ['cancelled', 'landed', 'diverted'].includes(segment.status)) {
    return { outcome: 'skipped', changes: 0 };
  }
  // The T−3 h check opens the leg's Live Activity window even with no provider configured.
  await withSystem(pool, (tx) => syncLaPhase(tx, segment.id, now));
  if (providers.aero !== undefined && timer.slot === 't72')
    await registerAlert(pool, providers.aero, segment);
  const reading = await readingFor(providers, segment);
  if (reading === null) return { outcome: 'skipped', changes: 0 };
  const changes = await withSystem(pool, (tx) => applyReading(tx, segment.id, reading, now));
  return { outcome: 'polled', changes: changes.length };
}

export function flightPollJob(providers: FlightProviders): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: BOOKINGS_QUEUES.flightPoll,
    schema: scheduledJobDataSchema,
    singletonKey: (data) => `${data.ref_id}:${data.slot}`,
    handler: async (data, ctx) => pollFlight(ctx.pool, providers, data, new Date()),
  });
}
