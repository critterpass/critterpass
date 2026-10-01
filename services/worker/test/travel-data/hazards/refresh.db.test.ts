/**
 * `hazards.refresh` over a migrated Postgres with the recorded official pages: Batur easing from
 * Level II to Level I and Rinjani first seen at Level II each emit one `hazard.changed` for the Bali
 * trip, Agung first seen at normal is stored quietly, Popocatépetl takes CENAPRED's light while GDACS
 * lists no watched volcano, the same pages again emit nothing, and a failed feed leaves the last
 * values.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fetchCenapred } from '../../../src/travel-data/hazards/cenapred';
import { fetchGdacs } from '../../../src/travel-data/hazards/gdacs';
import { fetchImo } from '../../../src/travel-data/hazards/imo';
import { fetchJma } from '../../../src/travel-data/hazards/jma';
import { fetchMagma } from '../../../src/travel-data/hazards/magma';
import { refreshHazards, type HazardFeeds } from '../../../src/travel-data/hazards/refresh';
import {
  insertCrew,
  insertUser,
  silentLogger,
  startNotifyDb,
  type NotifyDb,
} from '../../notify-fixtures';
import {
  HAZARD_FIXTURES,
  insertLiveDestinations,
  insertTripWithPlan,
  RECORDED_HAZARD_ROUTES,
  recordedHttp,
  type RecordedRoute,
} from '../travel-fixtures';

let db: NotifyDb;
let destinations: Record<string, string>;
let baliTrip: string;
const NOW = new Date('2026-09-29T03:00:00Z');

function feeds(routes: readonly RecordedRoute[] = RECORDED_HAZARD_ROUTES): HazardFeeds {
  const { http } = recordedHttp(HAZARD_FIXTURES, routes);
  return {
    magma: (signal) => fetchMagma(http, signal),
    imo: (signal) => fetchImo(http, signal),
    jma: (codes, signal) => fetchJma(http, codes, signal),
    cenapred: (signal) => fetchCenapred(http, signal),
    gdacs: (signal) => fetchGdacs(http, signal),
  };
}

beforeAll(async () => {
  db = await startNotifyDb();
  destinations = await insertLiveDestinations(db.pool);
  const traveller = await insertUser(db.pool);
  const crewId = await insertCrew(db.pool, [traveller]);
  baliTrip = (
    await insertTripWithPlan(db.pool, {
      crewId,
      destinationId: destinations['bali'] ?? '',
      status: 'pre_trip',
      items: [],
    })
  ).tripId;
  // Batur was elevated when last read.
  await db.pool.query(
    `INSERT INTO hazard_alerts (destination_id, kind, subject, level, level_label, headline, source,
       source_url, issued_at, fetched_at)
     VALUES ($1, 'volcano', 'Batur', 2, 'Level II (Waspada)', 'Batur (Bali) is at Level II (Waspada)',
       'magma', 'https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas', '2026-09-01', '2026-09-27')`,
    [destinations['bali']],
  );
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function hazardEvents() {
  const { rows } = await db.pool.query<{ trip_id: string; payload: Record<string, unknown> }>(
    "SELECT trip_id, payload FROM domain_events WHERE type = 'hazard.changed' ORDER BY occurred_at",
  );
  return rows;
}

describe('refreshHazards', () => {
  it('announces the Batur level change and the elevated Rinjani to the Bali trip once', async () => {
    const report = await refreshHazards({
      pool: db.pool,
      feeds: feeds(),
      logger: silentLogger,
      now: NOW,
    });
    expect(report).toMatchObject({ feedsRead: 5, feedsFailed: 0, events: 2 });
    const events = await hazardEvents();
    expect(events).toHaveLength(2);
    expect(events).toMatchObject([
      {
        trip_id: baliTrip,
        payload: {
          trip_id: baliTrip,
          destination_id: destinations['bali'],
          kind: 'volcano',
          source: 'magma',
          subject: 'Batur',
          from_level: 2,
          to_level: 1,
          impact: 20,
        },
      },
      {
        trip_id: baliTrip,
        payload: { subject: 'Rinjani', from_level: null, to_level: 2 },
      },
    ]);
    const { rows } = await db.pool.query(
      `SELECT subject, source, level, level_label FROM hazard_alerts
        WHERE destination_id = $1 ORDER BY source, subject`,
      [destinations['bali']],
    );
    expect(rows).toEqual([
      { subject: 'Agung', source: 'magma', level: 1, level_label: 'Level I (Normal)' },
      { subject: 'Batur', source: 'magma', level: 1, level_label: 'Level I (Normal)' },
      { subject: 'Rinjani', source: 'magma', level: 2, level_label: 'Level II (Waspada)' },
    ]);
  });

  it("stores Popocatépetl's CENAPRED light for Mexico City", async () => {
    const { rows } = await db.pool.query(
      `SELECT subject, source, level, level_label, issued_at, expires_at FROM hazard_alerts
        WHERE destination_id = $1`,
      [destinations['mexico-city']],
    );
    expect(rows).toEqual([
      {
        subject: 'Popocatepetl',
        source: 'cenapred',
        level: 2,
        level_label: 'Amarillo Fase 2',
        issued_at: new Date('2026-09-28T16:19:00Z'),
        expires_at: new Date('2026-10-01T16:19:00Z'),
      },
    ]);
  });

  it('emits nothing when the same pages are read again', async () => {
    const report = await refreshHazards({
      pool: db.pool,
      feeds: feeds(),
      logger: silentLogger,
      now: new Date(NOW.getTime() + 15 * 60_000),
    });
    expect(report.events).toBe(0);
    expect(await hazardEvents()).toHaveLength(2);
  });

  it('keeps the last values when a feed fails', async () => {
    const report = await refreshHazards({
      pool: db.pool,
      feeds: feeds(RECORDED_HAZARD_ROUTES.filter((route) => !route.file.startsWith('magma'))),
      logger: silentLogger,
      now: new Date(NOW.getTime() + 30 * 60_000),
    });
    expect(report).toMatchObject({ feedsFailed: 1, events: 0 });
    const { rows } = await db.pool.query(
      "SELECT level FROM hazard_alerts WHERE subject = 'Batur' AND source = 'magma'",
    );
    expect(rows).toEqual([{ level: 1 }]);
  });
});
