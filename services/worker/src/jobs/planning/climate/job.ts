/**
 * `climate.normals` (docs/api-contracts-planning.md, jobs): fills `climate_normals` for each
 * destination with a known centre, one 0.1° cell at its centre, for every month that has no row
 * yet. Rows are kept: the usual chance of rain does not change month to month, so a run only
 * spends history calls on months still missing (a new destination, or a month that had too few
 * usable samples last time). The monthly cron catches up whatever a run did not reach.
 */
import { withSystem } from '@cp/db';
import {
  climateNormalsJobSchema,
  DEFAULT_QUEUE_SPEC,
  PLANNING_QUEUES,
  planningQueueSpecs,
  TRAVEL_DESTINATIONS,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../../../boss';
import type { HistoryDay } from '../../../travel-data/weatherapi-client';
import { cellOf, MIN_SAMPLES, rainNormals, sampleDates, yearsOf } from './normals';

/** One past day at a point; null when the provider has nothing for it. */
export type HistorySource = (
  query: { readonly lat: number; readonly lng: number; readonly date: string },
  signal?: AbortSignal,
) => Promise<HistoryDay | null>;

/** Months worked out per run, so one run stays well inside its expiry. */
export const MAX_MONTHS_PER_RUN = 60;

interface DestinationCell {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly cell: string;
}

async function destinationsToFill(
  tx: pg.PoolClient,
  destinationId: string | undefined,
): Promise<DestinationCell[]> {
  const { rows } = await tx.query<{ id: string; slug: string }>(
    `SELECT id, slug FROM destinations
      WHERE slug = ANY($1::text[]) AND ($2::uuid IS NULL OR id = $2)
      ORDER BY slug`,
    [Object.keys(TRAVEL_DESTINATIONS), destinationId ?? null],
  );
  return rows.flatMap((row) => {
    const centroid = TRAVEL_DESTINATIONS[row.slug]?.centroid;
    return centroid === undefined
      ? []
      : [{ id: row.id, lat: centroid.lat, lng: centroid.lng, cell: cellOf(centroid) }];
  });
}

async function missingMonths(tx: pg.PoolClient, place: DestinationCell): Promise<number[]> {
  const { rows } = await tx.query<{ month: number }>(
    'SELECT month FROM climate_normals WHERE destination_id = $1 AND cell = $2',
    [place.id, place.cell],
  );
  const have = new Set(rows.map((row) => row.month));
  return Array.from({ length: 12 }, (_, index) => index + 1).filter((month) => !have.has(month));
}

async function sampleMonth(
  history: HistorySource,
  place: DestinationCell,
  month: number,
  now: Date,
  logger: JobLogger,
  signal?: AbortSignal,
): Promise<HistoryDay[]> {
  const days: HistoryDay[] = [];
  for (const date of sampleDates(month, now)) {
    signal?.throwIfAborted();
    try {
      const day = await history({ lat: place.lat, lng: place.lng, date }, signal);
      if (day !== null) days.push(day);
    } catch (error) {
      logger.warn({ date, err: String(error) }, 'climate history sample skipped');
    }
  }
  return days;
}

export interface ClimateRunReport {
  readonly written: number;
  readonly skipped: number;
  readonly remaining: number;
}

export async function fillClimateNormals(options: {
  readonly pool: pg.Pool;
  readonly history: HistorySource;
  readonly logger: JobLogger;
  readonly destinationId?: string;
  readonly now?: Date;
  readonly signal?: AbortSignal;
}): Promise<ClimateRunReport> {
  const now = options.now ?? new Date();
  const places = await withSystem(options.pool, (tx) =>
    destinationsToFill(tx, options.destinationId),
  );
  const todo: { place: DestinationCell; month: number }[] = [];
  for (const place of places) {
    const months = await withSystem(options.pool, (tx) => missingMonths(tx, place));
    todo.push(...months.map((month) => ({ place, month })));
  }
  let written = 0;
  let skipped = 0;
  for (const { place, month } of todo.slice(0, MAX_MONTHS_PER_RUN)) {
    const days = await sampleMonth(
      options.history,
      place,
      month,
      now,
      options.logger,
      options.signal,
    );
    if (days.length < MIN_SAMPLES) {
      skipped += 1;
      continue;
    }
    await withSystem(options.pool, (tx) =>
      tx.query(
        `INSERT INTO climate_normals (destination_id, cell, month, rain_pct, source, years, computed_at)
         VALUES ($1, $2, $3, $4::smallint[], 'weatherapi_history', $5, $6)
         ON CONFLICT (destination_id, cell, month) DO UPDATE
           SET rain_pct = EXCLUDED.rain_pct, years = EXCLUDED.years,
               computed_at = EXCLUDED.computed_at, updated_at = now()`,
        [place.id, place.cell, month, rainNormals(days), yearsOf(days), now],
      ),
    );
    written += 1;
  }
  return { written, skipped, remaining: Math.max(0, todo.length - MAX_MONTHS_PER_RUN) };
}

export function climateNormalsJob(history: HistorySource): AnyJobDefinition {
  return defineJob({
    queue: PLANNING_QUEUES.climateNormals,
    spec: planningQueueSpecs(DEFAULT_QUEUE_SPEC)[PLANNING_QUEUES.climateNormals],
    schema: climateNormalsJobSchema.nullish(),
    async handler(data, { pool, logger, job }) {
      const report = await fillClimateNormals({
        pool,
        history,
        logger,
        signal: job.signal,
        ...(data?.destination_id === undefined ? {} : { destinationId: data.destination_id }),
      });
      logger.info({ ...report }, 'climate normals refreshed');
      return { ...report };
    },
  });
}
