/**
 * `import.parse` against a migrated Postgres. A scanned boarding pass (IATA BCBP) for a flight the
 * traveller already has in the wallet is proposed as that booking's barcode and seat; a pasted
 * link off the supplier allow-list is read as text, so without a model it becomes "add it by hand".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exponentOf } from '../../src/jobs/bookings';
import { parseImport, type ImportParseDeps } from '../../src/jobs/bookings/paste-parse';
import { startSetupWorld, type SetupWorld } from '../setup/setup-fixture';

let world: SetupWorld;
const deps: ImportParseDeps = {
  exponentOf,
  fetch: {
    lookup: () => Promise.reject(new Error('no network in this suite')),
    transport: () => Promise.reject(new Error('no network in this suite')),
  },
  now: () => new Date('2026-10-01T00:00:00Z'),
};

async function parsing(uid: string, kind: 'paste' | 'scan'): Promise<string> {
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO import_candidates (user_id, crew_id, trip_id, source, dedupe_key, status)
     VALUES ($1, $2, $3, $4, 'pending:' || gen_random_uuid(), 'parsing') RETURNING id`,
    [uid, world.crewId, world.tripId, kind],
  );
  return row?.id as string;
}

beforeAll(async () => {
  world = await startSetupWorld(2);
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('import.parse', () => {
  it('proposes a scanned boarding pass as the barcode of the wallet flight it is for', async () => {
    const [owner] = world.members as [string];
    const [booking] = await world.q<{ id: string }>(
      `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, supplier)
       VALUES ($1, $2, 'flight', 'SQ 938 · SIN → DPS', 'personal', 'airline') RETURNING id`,
      [world.tripId, owner],
    );
    await world.q(
      `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, carrier, flight_no,
         dep_airport, arr_airport, sched_dep_at)
       VALUES ($1, $2, $3, true, 'SQ', '938', 'SIN', 'DPS', '2026-10-12T01:40:00Z')`,
      [booking?.id, world.tripId, owner],
    );
    const id = await parsing(owner, 'scan');
    // Day 285 is 12 October 2026.
    const payload = 'M1TAN/MAYA            EXYZ789 SINDPSSQ 0938 285Y032A0001 100';
    expect(
      await parseImport(world.harness.pool, deps, {
        candidate_id: id,
        kind: 'scan',
        barcode: { format: 'pdf417', payload },
      }),
    ).toBe('parsed');
    const [candidate] = await world.q<{
      status: string;
      booking_id: string;
      extracted: { barcode: { payload: string }; details: { seat: string } };
    }>('SELECT status, booking_id, extracted FROM import_candidates WHERE id = $1', [id]);
    expect(candidate).toMatchObject({ status: 'duplicate', booking_id: booking?.id });
    expect(candidate?.extracted.barcode.payload).toBe(payload);
    expect(candidate?.extracted.details.seat).toBe('32A');
  });

  it('reads a link off the allow-list as text, and fails over without a model', async () => {
    const id = await parsing(world.members[1] as string, 'paste');
    expect(
      await parseImport(world.harness.pool, deps, {
        candidate_id: id,
        kind: 'paste',
        url: 'http://169.254.169.254/latest/meta-data',
      }),
    ).toBe('failed');
    const [candidate] = await world.q<{ status: string; failure_reason: string }>(
      'SELECT status, failure_reason FROM import_candidates WHERE id = $1',
      [id],
    );
    expect(candidate).toEqual({ status: 'failed', failure_reason: 'unreadable' });
  });
});
