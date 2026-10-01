/**
 * `GET /v1/trips/{id}/offline-bundle` with the trip day section, against a migrated Postgres: a
 * member gets today's and later days' manifests (never a past day) beside the bookings section,
 * each asset with a media-worker URL valid for 24 hours; someone outside the crew gets nothing.
 */
import { withSystem } from '@cp/db';
import { toLocalWallTime } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerOfflineBundleRoute } from '../../src/bookings/offline-bundle';
import { registerTripDayBundleSection } from '../../src/routes/offline-bundle';
import { signing } from '../bookings/bookings-harness';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

const TZ = 'Asia/Makassar';
let harness: CommandDoorsHarness;
let member: SignedIn;
let outsider: SignedIn;
let tripId: string;

const day = (offset: number) =>
  toLocalWallTime(new Date(Date.now() + offset * 86_400_000), TZ).date;

async function fetchBundle(who: SignedIn) {
  const response = await harness.request(`/v1/trips/${tripId}/offline-bundle`, {
    headers: { cookie: who.cookie },
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerOfflineBundleRoute(app, { ...deps, signing }),
  );
  registerTripDayBundleSection();
  [member, outsider] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  tripId = await withSystem(harness.pool, async (tx) => {
    const crew = await tx.query<{ id: string }>(
      "INSERT INTO crews (name, created_by) VALUES ('Bali Six', $1) RETURNING id",
      [member.uid],
    );
    const crewId = crew.rows[0]!.id;
    await tx.query(
      "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')",
      [crewId, member.uid],
    );
    const trip = await tx.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status, tz) VALUES ($1, 'voting', $2) RETURNING id",
      [crewId, TZ],
    );
    const id = trip.rows[0]!.id;
    await tx.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')",
      [id, member.uid],
    );
    const manifest = (date: string) =>
      JSON.stringify({
        local_date: date,
        assets: [
          {
            kind: 'map_region',
            key: 'maps/bali.pmtiles',
            bytes: 48000000,
            label: 'Map',
            ref_id: null,
          },
        ],
        map_region_ref: null,
        fx: [],
        places: [],
        forecasts: [],
      });
    for (const [offset, version] of [
      [-1, 3],
      [0, 2],
      [1, 1],
    ] as const) {
      await tx.query(
        `INSERT INTO offline_bundles (trip_id, local_date, version, content_hash, manifest)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, day(offset), version, `hash-${offset}`, manifest(day(offset))],
      );
    }
    return id;
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('offline bundle days', () => {
  it('gives a member today and later days with 24-hour signed asset URLs', async () => {
    const { status, body } = await fetchBundle(member);
    expect(status).toBe(200);
    const sections = body['sections'] as {
      bookings: unknown;
      days: {
        items: {
          local_date: string;
          version: number;
          assets: { url: string; expires_at: string }[];
        }[];
      };
    };
    expect(sections.bookings).toBeDefined();
    expect(sections.days.items.map((item) => [item.local_date, item.version])).toEqual([
      [day(0), 2],
      [day(1), 1],
    ]);
    const asset = sections.days.items[0]!.assets[0]!;
    expect(asset.url.startsWith(signing.baseUrl)).toBe(true);
    const ttl = Date.parse(asset.expires_at) - Date.now();
    expect(ttl).toBeGreaterThan(23 * 3_600_000);
    expect(ttl).toBeLessThanOrEqual(24 * 3_600_000);
  });

  it('gives someone outside the crew nothing', async () => {
    const { status, body } = await fetchBundle(outsider);
    expect(status).toBe(404);
    expect(body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
