/**
 * A detected visit end to end through the offline door, as the phone sends it: consent, then the
 * arrival op and the departure op (same visit id) in one `/sync/upload` batch, a replay of the
 * batch, and the row the owner alone can read — a POI and two instants, no coordinates — which
 * the owner can delete. Expiry after the trip is archived is the worker's `visits.ttl` job
 * (services/worker/test/jobs/location/location-ttl.db.test.ts).
 */
import { withSystem } from '@cp/db';
import { generateUuidV7, MOCK_FLAG_SIMULATED } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerLocationCommands } from '../../src/commands/visits';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';
import { buildLocationFixture, type LocationFixture } from './location-fixture';

let harness: CommandDoorsHarness;
let fx: LocationFixture;

beforeAll(async () => {
  harness = await startCommandDoors(registerLocationCommands);
  fx = await buildLocationFixture(harness);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

function op(session: SignedIn, cmd: string, payload: unknown) {
  return envelope(cmd, payload, { actor: { uid: session.uid, via: 'offline' } });
}

async function upload(session: SignedIn, ops: unknown[]) {
  const response = await harness.request('/sync/upload', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify({ ops }),
  });
  const body = (await response.json()) as { results: { status: string; code?: string }[] };
  return { status: response.status, results: body.results };
}

describe('a detected visit through the offline door', () => {
  it('stores one coordinate-free visit from arrival + departure ops, idempotently', async () => {
    const visitId = generateUuidV7();
    const arrivedAt = new Date(Date.now() - 40 * 60_000).toISOString();
    const leftAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const base = { visit_id: visitId, trip_id: fx.tripId, poi_id: fx.poiId, source: 'geofence' };
    const ops = [
      op(fx.traveller, 'set_consent', { purpose: 'visit_detection', granted: true }),
      op(fx.traveller, 'record_visit', {
        ...base,
        arrived_at: arrivedAt,
        evidence: { dwell_s: 600, acc: 14 },
      }),
      op(fx.traveller, 'record_visit', {
        ...base,
        arrived_at: arrivedAt,
        left_at: leftAt,
        evidence: { dwell_s: 1800, acc: 14 },
      }),
    ];

    const first = await upload(fx.traveller, ops);
    expect(first.status).toBe(200);
    expect(first.results.map((r) => r.status)).toEqual(['applied', 'applied', 'applied']);
    const replay = await upload(fx.traveller, ops);
    expect(replay.results.map((r) => r.status)).toEqual(['duplicate', 'duplicate', 'duplicate']);

    const rows = await withSystem(harness.pool, async (tx) => {
      const result = await tx.query<Record<string, unknown>>('SELECT * FROM visits WHERE id = $1', [
        visitId,
      ]);
      return result.rows;
    });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row['user_id']).toBe(fx.traveller.uid);
    expect((row['left_at'] as Date).toISOString()).toBe(leftAt);
    expect(Object.keys(row).some((column) => /lat|lng|geo|location/.test(column))).toBe(false);

    // Someone else's delete (their own session) finds nothing to delete.
    const other = await upload(fx.crewmate, [
      op(fx.crewmate, 'delete_visit', { visit_id: visitId }),
    ]);
    expect(other.results[0]?.status).toBe('applied');
    const kept = await withSystem(harness.pool, (tx) =>
      tx.query('SELECT 1 FROM visits WHERE id = $1', [visitId]),
    );
    expect(kept.rowCount).toBe(1);
    const own = await upload(fx.traveller, [
      op(fx.traveller, 'delete_visit', { visit_id: visitId }),
    ]);
    expect(own.results[0]?.status).toBe('applied');
    const left = await withSystem(harness.pool, (tx) =>
      tx.query('SELECT 1 FROM visits WHERE id = $1', [visitId]),
    );
    expect(left.rowCount).toBe(0);
  });

  it('rejects spoofed evidence in the batch without blocking the ops after it', async () => {
    const spoofed = op(fx.traveller, 'record_visit', {
      visit_id: generateUuidV7(),
      trip_id: fx.tripId,
      poi_id: fx.poiId,
      source: 'geofence',
      arrived_at: new Date(Date.now() - 20 * 60_000).toISOString(),
      evidence: { dwell_s: 900, acc: 10, mock_flags: MOCK_FLAG_SIMULATED },
    });
    const manual = op(fx.traveller, 'record_visit', {
      visit_id: generateUuidV7(),
      trip_id: fx.tripId,
      poi_id: fx.poiId,
      source: 'manual',
      arrived_at: new Date().toISOString(),
    });
    const result = await upload(fx.traveller, [spoofed, manual]);
    expect(result.results.map((r) => [r.status, r.code ?? null])).toEqual([
      ['rejected', 'LOCATION_IMPLAUSIBLE'],
      ['applied', null],
    ]);
  });
});
