/**
 * Day bundles against a migrated Postgres: Batur day's manifest names the crew's pickup document,
 * Indonesian phrase audio, the Bali map region, the rupiah rate with its date, the day's place and
 * its forecast; the version bumps only when the content hash changes; and the nightly timers are
 * armed at 20:00 the evening before each remaining day (a day whose evening passed is queued now).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildDayBundle } from '../../src/jobs/trip-day/daybundle-build';
import { armDayBundles } from '../../src/jobs/trip-day/daybundle-triggers';
import { withSystem } from '@cp/db';
import { NOW, startTripDayWorld, TRIP_TZ, type TripDayWorld } from './trip-day-world';

let world: TripDayWorld;

interface Manifest {
  assets: { kind: string; key: string; label: string }[];
  map_region_ref: { key: string } | null;
  fx: { base: string; quote: string; as_of: string }[];
  places: { name: string }[];
  forecasts: { point_key: string }[];
}

async function bundle(): Promise<{ version: number; manifest: Manifest }> {
  const [row] = await world.q<{ version: number; manifest: Manifest }>(
    "SELECT version, manifest FROM offline_bundles WHERE trip_id = $1 AND local_date = '2026-10-15'",
    [world.tripId],
  );
  return row!;
}

beforeAll(async () => {
  world = await startTripDayWorld();
  const [release] = await world.q<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
       item_count, approved_by, approved_at, published_at)
     VALUES ('phrases', 1, 'trip-day-phrases', 'Phrases', 'published', 'publish', repeat('0', 64),
       '{}', 1, $1, now(), now()) RETURNING id`,
    [world.members[0]],
  );
  await world.q(
    `INSERT INTO phrase_cards (key, language, context, text, gloss, audio_status, audio_key, release_id,
       native_reviewed_on)
     VALUES ('id:emergency:doctor', 'id', 'emergency', 'Saya butuh dokter.', 'I need a doctor.',
       'ready', 'content/phrases/id/doctor.m4a', $1, '2026-09-01')`,
    [release!.id],
  );
  await world.q(
    `INSERT INTO map_regions (destination_id, pmtiles_key, bytes, version)
     VALUES ($1, 'maps/bali-2026-09.pmtiles', 48000000, '2026-09')`,
    [world.destinationId],
  );
  await world.q(
    `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
     VALUES ('USD', 'IDR', 16250.5, '2026-10-13', 'test'), ('USD', 'IDR', 16310.0, '2026-10-14', 'test')`,
  );
  await world.q(
    `INSERT INTO booking_attachments (booking_id, trip_id, owner_id, media_key, kind, crew_visible)
     VALUES ($1, $2, $3, 'u/maya/booking_doc/pickup.pdf', 'pdf', true)`,
    [world.transferBookingId, world.tripId, world.members[0]],
  );
}, 240_000);

afterAll(async () => {
  await world.stop();
});

describe('daybundle.build', () => {
  it('writes the day manifest from what the day needs offline', async () => {
    expect(await buildDayBundle(world.harness.pool, world.tripId, '2026-10-15')).toEqual({
      version: 1,
      changed: true,
    });
    const { manifest } = await bundle();
    expect(manifest.assets.map((asset) => [asset.kind, asset.key])).toEqual([
      ['attachment', 'u/maya/booking_doc/pickup.pdf'],
      ['phrase_audio', 'content/phrases/id/doctor.m4a'],
      ['map_region', 'maps/bali-2026-09.pmtiles'],
    ]);
    expect(manifest.map_region_ref?.key).toBe('maps/bali-2026-09.pmtiles');
    expect(manifest.fx).toEqual([
      expect.objectContaining({ base: 'USD', quote: 'IDR', as_of: '2026-10-14' }),
    ]);
    expect(manifest.places.map((place) => place.name)).toEqual(['Mount Batur']);
    expect(manifest.forecasts).toEqual([]);
  });

  it('bumps the version only when the content changes', async () => {
    expect(await buildDayBundle(world.harness.pool, world.tripId, '2026-10-15')).toEqual({
      version: 1,
      changed: false,
    });
    await world.q(
      `INSERT INTO weather_snapshots (destination_id, point_key, lat, lng, elevation_m, date, hourly,
         source, fetched_at, checked_at)
       VALUES ($1, 'summit:batur', -8.2421, 115.3751, 1717, '2026-10-15', '{"hours": []}',
         'weatherapi', now(), now())`,
      [world.destinationId],
    );
    expect(await buildDayBundle(world.harness.pool, world.tripId, '2026-10-15')).toEqual({
      version: 2,
      changed: true,
    });
    expect((await bundle()).manifest.forecasts.map((f) => f.point_key)).toEqual(['summit:batur']);
  });
});

describe('day bundle triggers', () => {
  it('arms 20:00 the night before each remaining day and queues a day whose evening passed', async () => {
    const covered = await withSystem(world.harness.pool, (tx) =>
      armDayBundles(tx, world.tripId, NOW),
    );
    // 14 October 16:00 in Bali: the 14th's evening before has passed, the 15th–19th are ahead.
    expect(covered).toBe(6);
    const timers = await world.q<{ slot: string; local_at: string; tz: string }>(
      `SELECT slot, local_at::text AS local_at, tz FROM scheduled_events
        WHERE kind = 'daybundle.build' AND ref_id = $1 ORDER BY slot`,
      [world.tripId],
    );
    expect(timers[0]).toEqual({ slot: '2026-10-15', local_at: '2026-10-14 20:00:00', tz: TRIP_TZ });
    expect(timers).toHaveLength(5);
    const queued = await world.q<{ data: { local_date: string } }>(
      "SELECT data FROM pgboss.job WHERE name = 'daybundle.build'",
    );
    expect(queued.map((job) => job.data.local_date)).toContain('2026-10-14');
  });
});
