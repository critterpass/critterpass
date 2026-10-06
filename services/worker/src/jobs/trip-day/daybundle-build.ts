/**
 * `daybundle.build`: the offline manifest of one trip day (docs/api-contracts.md §5.5): the
 * crew-visible booking documents in play that day, phrase audio in the destination's language, the
 * map region, the latest FX rates with their date, labels for the day's places (from the trip's own
 * `trip_places` cards) and the day's point forecasts. The manifest is hashed in canonical form; the
 * version bumps only when the content changed, so devices download deltas and a rerun with nothing
 * new changes nothing.
 */
import { createHash } from 'node:crypto';

import { dayArea, scheduledJobDataSchema, withSystem } from '@cp/db';
import {
  canonicalJson,
  dayBundleJobSchema,
  localSchedule,
  phraseLanguageFor,
  TRIP_DAY_QUEUES,
  type BundleAsset,
  type BundleManifest,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';

const PHRASE_LIMIT = 60;

interface TripFacts {
  readonly tz: string;
  readonly destination_id: string | null;
  readonly country: string | null;
  readonly currency: string | null;
  readonly version_id: string | null;
}

async function attachments(
  tx: pg.PoolClient,
  tripId: string,
  from: Date,
  to: Date,
): Promise<BundleAsset[]> {
  const { rows } = await tx.query<{ id: string; media_key: string; title: string }>(
    `SELECT a.id, a.media_key, b.title FROM booking_attachments a JOIN bookings b ON b.id = a.booking_id
      WHERE b.trip_id = $1 AND b.deleted_at IS NULL AND b.visibility = 'crew' AND a.crew_visible
        AND b.starts_at < $3 AND coalesce(b.ends_at, b.starts_at) >= $2
      ORDER BY b.starts_at, a.id`,
    [tripId, from, to],
  );
  return rows.map((row) => ({
    kind: 'attachment',
    key: row.media_key,
    bytes: null,
    label: row.title,
    ref_id: row.id,
  }));
}

/** The area the plan's day on `localDate` is spent in; null when no day of the plan falls on it. */
async function dayAreaOn(
  tx: pg.PoolClient,
  tripId: string,
  versionId: string | null,
  localDate: string,
): Promise<string | null> {
  if (versionId === null) return null;
  const { rows } = await tx.query<{ id: string }>(
    'SELECT id FROM plan_days WHERE version_id = $1 AND date = $2::date',
    [versionId, localDate],
  );
  const dayId = rows[0]?.id;
  return dayId === undefined ? null : ((await dayArea(tx, tripId, dayId))?.areaId ?? null);
}

async function phraseAudio(tx: pg.PoolClient, country: string | null): Promise<BundleAsset[]> {
  const language = phraseLanguageFor(country);
  if (language === null) return [];
  const { rows } = await tx.query<{ id: string; audio_key: string; gloss: string }>(
    `SELECT id, audio_key, gloss FROM phrase_cards
      WHERE language = $1 AND audio_key IS NOT NULL AND app.is_live_release(release_id)
      ORDER BY key LIMIT $2`,
    [language, PHRASE_LIMIT],
  );
  return rows.map((row) => ({
    kind: 'phrase_audio',
    key: row.audio_key,
    bytes: null,
    label: row.gloss.slice(0, 120),
    ref_id: row.id,
  }));
}

/** The manifest for one trip day, or null when the trip has no dates or zone. */
export async function dayManifest(
  tx: pg.PoolClient,
  tripId: string,
  localDate: string,
): Promise<BundleManifest | null> {
  const { rows } = await tx.query<TripFacts>(
    `SELECT coalesce(t.tz, d.tz) AS tz, t.destination_id, d.country,
            coalesce(t.local_currency, d.currency) AS currency, t.current_version_id AS version_id
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
    [tripId],
  );
  const trip = rows[0];
  if (trip === undefined || trip.tz === null) return null;
  const from = localSchedule({ date: localDate, time: '00:00', tz: trip.tz });
  const to = new Date(from.getTime() + 86_400_000);
  // The map and forecast are the day's area's: a day trip carries its area's pack, or none.
  const area = (await dayAreaOn(tx, tripId, trip.version_id, localDate)) ?? trip.destination_id;
  const region = await tx.query<{
    id: string;
    pmtiles_key: string;
    version: string;
    bytes: string;
  }>(
    `SELECT id, pmtiles_key, version, bytes::text FROM map_regions WHERE destination_id = $1
      ORDER BY updated_at DESC LIMIT 1`,
    [area],
  );
  const map = region.rows[0];
  const fx = await tx.query<{ base: string; quote: string; rate: string; as_of: string }>(
    `SELECT DISTINCT ON (base, quote) base, quote, rate::text, as_of::text FROM fx_snapshots
      WHERE $1::text IS NOT NULL AND (quote = $1 OR base = $1)
      ORDER BY base, quote, as_of DESC`,
    [trip.currency],
  );
  // The day's labels are the trip's own place cards, the same rows the trip stream syncs. A plan
  // change queues this build before the debounced card refresh runs, so bring the cards in line
  // first (a refresh with nothing new writes nothing).
  await tx.query('SELECT app.refresh_trip_places($1)', [tripId]);
  const places = await tx.query<BundleManifest['places'][number]>(
    `SELECT DISTINCT ON (p.poi_id) p.poi_id, p.name, p.address, p.lat, p.lng
       FROM plan_items i
       JOIN trip_places p ON p.trip_id = i.trip_id AND p.poi_id = i.poi_id AND p.visibility = 'crew'
      WHERE i.version_id = $1 AND i.trip_id = $4 AND i.starts_at >= $2 AND i.starts_at < $3
      ORDER BY p.poi_id`,
    [trip.version_id, from, to, tripId],
  );
  const forecasts = await tx.query<BundleManifest['forecasts'][number]>(
    `SELECT point_key, elevation_m, hourly FROM weather_snapshots
      WHERE destination_id = $1 AND date = $2::date ORDER BY point_key`,
    [area, localDate],
  );
  const assets = [
    ...(await attachments(tx, tripId, from, to)),
    ...(await phraseAudio(tx, trip.country)),
    ...(map === undefined
      ? []
      : [
          {
            kind: 'map_region' as const,
            key: map.pmtiles_key,
            bytes: Number(map.bytes),
            label: 'Map',
            ref_id: map.id,
          },
        ]),
  ];
  return {
    local_date: localDate,
    assets,
    map_region_ref:
      map === undefined
        ? null
        : {
            region_id: map.id,
            key: map.pmtiles_key,
            version: map.version,
            bytes: Number(map.bytes),
          },
    fx: fx.rows,
    places: places.rows,
    forecasts: forecasts.rows,
  };
}

export interface DayBundleResult {
  readonly version: number;
  readonly changed: boolean;
}

/** Writes the day's manifest; the version moves only when its content hash does. */
export async function buildDayBundle(
  pool: pg.Pool,
  tripId: string,
  localDate: string,
): Promise<DayBundleResult | null> {
  return withSystem(pool, async (tx) => {
    const manifest = await dayManifest(tx, tripId, localDate);
    if (manifest === null) return null;
    const hash = createHash('sha256').update(canonicalJson(manifest)).digest('hex');
    const { rows } = await tx.query<{ version: number; changed: boolean }>(
      `INSERT INTO offline_bundles (trip_id, local_date, content_hash, manifest)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (trip_id, local_date) DO UPDATE
         SET version = offline_bundles.version + 1, content_hash = EXCLUDED.content_hash,
             manifest = EXCLUDED.manifest, built_at = now()
         WHERE offline_bundles.content_hash <> EXCLUDED.content_hash
       RETURNING version, true AS changed`,
      [tripId, localDate, hash, JSON.stringify(manifest)],
    );
    const row = rows[0];
    if (row !== undefined) return row;
    const current = await tx.query<{ version: number }>(
      'SELECT version FROM offline_bundles WHERE trip_id = $1 AND local_date = $2',
      [tripId, localDate],
    );
    return { version: current.rows[0]?.version ?? 1, changed: false };
  });
}

/** Queued directly (`{trip_id, local_date}`) or fired by a nightly `scheduled_events` timer. */
const jobSchema = z.union([dayBundleJobSchema, scheduledJobDataSchema]);
type DayBundlePayload = z.infer<typeof jobSchema>;

function target(data: DayBundlePayload): { tripId: string; localDate: string } {
  if ('trip_id' in data) return { tripId: data.trip_id, localDate: data.local_date };
  return { tripId: data.ref_id, localDate: data.slot };
}

export function dayBundleJob(): JobDefinition<DayBundlePayload> {
  return defineJob({
    queue: TRIP_DAY_QUEUES.dayBundle,
    schema: jobSchema,
    singletonKey: (data: DayBundlePayload) => {
      const { tripId, localDate } = target(data);
      return `${tripId}:${localDate}`;
    },
    handler: async (data, ctx) => {
      const { tripId, localDate } = target(data);
      const result = await buildDayBundle(ctx.pool, tripId, localDate);
      return result === null ? { outcome: 'no_dates' } : { ...result };
    },
  });
}
