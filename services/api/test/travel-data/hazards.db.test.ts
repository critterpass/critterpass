/**
 * `/v1/hazards`: a destination's current alerts, highest level first, with source links and read
 * times; expired readings (a GDACS eruption no longer listed) are left out and an alert not read lately is flagged stale.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { HazardView } from '../../src/travel-data/hazards-route';
import { registerTravelDataRoutes } from '../../src/travel-data/routes';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';
import { seedLiveDestinations } from './travel-seed';

let harness: CommandDoorsHarness;
let bali: string;

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerTravelDataRoutes(app, deps),
  );
  bali = (await seedLiveDestinations(harness.pool))['bali'] ?? '';
  const now = Date.now();
  await withSystem(harness.pool, (tx) =>
    tx.query(
      `INSERT INTO hazard_alerts (destination_id, kind, subject, level, level_label, headline, source,
         source_url, issued_at, expires_at, fetched_at)
       VALUES
         ($1, 'volcano', 'Batur', 1, 'Level I (Normal)', 'Batur (Bali) is at Level I (Normal)', 'magma',
          'https://magma.esdm.go.id/v1/gunung-api/laporan/326904', $2, NULL, $3),
         ($1, 'volcano', 'Rinjani', 2, 'Level II (Waspada)', 'Rinjani (NTB) is at Level II (Waspada)',
          'magma', 'https://magma.esdm.go.id/v1/gunung-api/laporan/326868', $2, NULL, $4),
         ($1, 'volcano', 'Agung', 3, 'Orange alert',
          'Agung (Indonesia) eruption: orange alert from the Global Disaster Alert and Coordination System, GDACS',
          'gdacs', 'https://www.gdacs.org/report.aspx?eventid=1000001&episodeid=1&eventtype=VO', $2, $5, $3)`,
      [
        bali,
        new Date(now - 86_400_000),
        new Date(now - 600_000),
        new Date(now - 5 * 3_600_000),
        new Date(now - 3_600_000),
      ],
    ),
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('GET /v1/hazards', () => {
  it('lists current alerts highest first, with source, times and staleness', async () => {
    const me = await harness.signInAnonymously();
    const response = await harness.request('/v1/hazards?destination_id=bali', {
      headers: { cookie: me.cookie },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { destination_id: string; alerts: HazardView[] };
    expect(body.destination_id).toBe(bali);
    expect(body.alerts.map((alert) => [alert.subject, alert.level, alert.stale])).toEqual([
      ['Rinjani', 2, true],
      ['Batur', 1, false],
    ]);
    expect(body.alerts[1]).toMatchObject({
      source: 'magma',
      source_url: 'https://magma.esdm.go.id/v1/gunung-api/laporan/326904',
      level_label: 'Level I (Normal)',
    });
  });

  it('requires a session and a known destination', async () => {
    expect((await harness.request('/v1/hazards?destination_id=bali')).status).toBe(401);
    const me = await harness.signInAnonymously();
    const unknown = await harness.request('/v1/hazards?destination_id=atlantis', {
      headers: { cookie: me.cookie },
    });
    expect(unknown.status).toBe(404);
  });
});
