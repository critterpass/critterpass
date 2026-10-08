/**
 * Scanning a confirmation or boarding pass on the real stack. The scan makes no network call of
 * its own: the device's OCR lines and barcode become the owner's `parsing` candidate with the
 * parse queued and `import.requested` recorded. A trip, when named, must be one the caller takes
 * part in; a candidate id is used once.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7, importParseJobSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { MoneyCrew, MoneyHarness } from '../money/money-harness';
import { buildMoneyCrew } from '../money/money-harness';
import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import { startBookingsHarness } from './bookings-harness';

/** What the device read off a printed boarding pass, top to bottom. */
const OCR_LINES = [
  'SINGAPORE AIRLINES',
  'TAN/MAYA MS',
  'SQ 938  SIN - DPS',
  '14 OCT  BOARDING 15:50  GATE B7  SEAT 41A',
];
const BARCODE = {
  format: 'pdf417',
  payload: 'M1TAN/MAYA MS         EABC123 SINDPSSQ 0938 287Y041A0012 100',
};

let harness: MoneyHarness;
let crew: MoneyCrew;
let organiser: SignedIn;
let maya: SignedIn;
let crewmateNotGoing: SignedIn;
let outsider: SignedIn;

async function candidate(id: string) {
  const { rows } = await harness.pool.query<Record<string, unknown>>(
    `SELECT user_id, crew_id, trip_id, source, status, dedupe_key, crew_visible
       FROM import_candidates WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function parseJobs(id: string) {
  const { rows } = await harness.pool.query<{ data: Record<string, unknown> }>(
    "SELECT data FROM pgboss.job WHERE name = 'import.parse' AND data->>'candidate_id' = $1",
    [id],
  );
  return rows.map((row) => row.data);
}

async function requestedEvents(id: string) {
  const { rows } = await harness.pool.query<Record<string, unknown>>(
    `SELECT actor_id, crew_id, trip_id, payload FROM domain_events
      WHERE type = 'import.requested' AND aggregate_id = $1`,
    [id],
  );
  return rows;
}

beforeAll(async () => {
  harness = await startBookingsHarness();
  crew = await buildMoneyCrew(harness, 3);
  [organiser, maya] = crew.members as [SignedIn, SignedIn];
  crewmateNotGoing = await harness.signIn();
  outsider = await harness.signIn();
  await withSystem(harness.pool, (tx) =>
    tx.query("INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')", [
      crew.crewId,
      crewmateNotGoing.uid,
    ]),
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('import_scan', () => {
  let scanned: string;

  it('files the scan under the trip as parsing and queues the text and barcode to be read', async () => {
    scanned = generateUuidV7();
    const response = await harness.run(maya, 'import_scan', {
      candidate_id: scanned,
      trip_id: crew.tripId,
      ocr_lines: OCR_LINES,
      barcode: BARCODE,
    });
    expect(resultOf(response)).toEqual({ candidate_id: scanned });
    expect(await candidate(scanned)).toEqual({
      user_id: maya.uid,
      crew_id: crew.crewId,
      trip_id: crew.tripId,
      source: 'scan',
      status: 'parsing',
      dedupe_key: `pending:${scanned}`,
      crew_visible: false,
    });
    expect(await parseJobs(scanned)).toEqual([
      { candidate_id: scanned, kind: 'scan', text: OCR_LINES.join('\n'), barcode: BARCODE },
    ]);
    expect(await requestedEvents(scanned)).toEqual([
      {
        actor_id: maya.uid,
        crew_id: crew.crewId,
        trip_id: crew.tripId,
        payload: {
          candidate_id: scanned,
          user_id: maya.uid,
          trip_id: crew.tripId,
          source: 'scan',
        },
      },
    ]);
  });

  it('takes a barcode alone, outside any trip', async () => {
    const candidateId = generateUuidV7();
    const response = await harness.run(outsider, 'import_scan', {
      candidate_id: candidateId,
      barcode: BARCODE,
    });
    expect(resultOf(response)).toEqual({ candidate_id: candidateId });
    expect(await candidate(candidateId)).toMatchObject({
      user_id: outsider.uid,
      crew_id: null,
      trip_id: null,
      source: 'scan',
      status: 'parsing',
    });
    // No OCR lines: the job carries no text at all, not an empty one.
    expect(await parseJobs(candidateId)).toEqual([
      { candidate_id: candidateId, kind: 'scan', barcode: BARCODE },
    ]);
    expect(await requestedEvents(candidateId)).toMatchObject([
      { actor_id: outsider.uid, crew_id: null, trip_id: null },
    ]);
  });

  it('queues a scan longer than the parser reads as its first whole lines', async () => {
    const candidateId = generateUuidV7();
    // The longest scan the command takes: 400 lines of 500 characters.
    const lines = Array.from({ length: 400 }, (_, n) => String(n % 10).repeat(500));
    const response = await harness.run(maya, 'import_scan', {
      candidate_id: candidateId,
      ocr_lines: lines,
    });
    expect(resultOf(response)).toEqual({ candidate_id: candidateId });
    const [job] = await parseJobs(candidateId);
    // 39 lines and their breaks are 19,538 characters; a fortieth would pass 20,000.
    expect(job?.['text']).toBe(lines.slice(0, 39).join('\n'));
    expect(importParseJobSchema.safeParse(job).success).toBe(true);
  });

  it('refuses a trip the caller is outside of, or in the crew but not going on', async () => {
    const byOutsider = generateUuidV7();
    const stranger = await harness.run(outsider, 'import_scan', {
      candidate_id: byOutsider,
      trip_id: crew.tripId,
      ocr_lines: OCR_LINES,
    });
    expect(errorOf(stranger)).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'trip' } });

    const byCrewmate = generateUuidV7();
    const notGoing = await harness.run(crewmateNotGoing, 'import_scan', {
      candidate_id: byCrewmate,
      trip_id: crew.tripId,
      ocr_lines: OCR_LINES,
    });
    expect(errorOf(notGoing)).toMatchObject({
      code: 'NOT_ELIGIBLE',
      detail: { reason: 'not_in_trip' },
    });

    for (const id of [byOutsider, byCrewmate]) {
      expect(await candidate(id)).toBeUndefined();
      expect(await parseJobs(id)).toEqual([]);
      expect(await requestedEvents(id)).toEqual([]);
    }
  });

  it('uses a candidate id once, whoever sends it again', async () => {
    for (const who of [maya, organiser]) {
      const again = await harness.run(who, 'import_scan', {
        candidate_id: scanned,
        trip_id: crew.tripId,
        ocr_lines: ['A different page'],
      });
      expect(errorOf(again)).toMatchObject({
        code: 'STATE_INVALID',
        detail: { reason: 'candidate_exists' },
      });
    }
    expect(await candidate(scanned)).toMatchObject({ user_id: maya.uid, status: 'parsing' });
    expect(await parseJobs(scanned)).toHaveLength(1);
    expect(await requestedEvents(scanned)).toHaveLength(1);
  });
});
