/**
 * A redraft plans from the guide's answers saved with the version it redoes. A must-do typed by
 * hand that only the guide could place is saved with its place and its time of day, the redraft's
 * plan input holds it as a must-do again, and the candidate's coverage counts must-dos from the
 * candidate's own items. No model call: the answers are the outline step's stored result.
 */
import { randomUUID } from 'node:crypto';

import type { WishAnswer } from '@cp/ai';
import { withSystem } from '@cp/db';
import { draftCoverageSchema, type Itinerary } from '@cp/domain';
import { dayWindow, scheduleDay } from '@cp/planner';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AgentStepContext } from '../../../../src/ai/job-runner';
import { load } from '../../../../src/jobs/ai/draft/job-context';
import { persistDraft } from '../../../../src/jobs/ai/draft/persist';
import { candidateCoverage } from '../../../../src/jobs/ai/draft/redraft-store';
import { startJobsHarness, type JobsHarness } from '../../../helpers/jobs-harness';
import { RECORDING, seedTrip } from './kyoto-trip';

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

/** A step's context as the job runner hands it over, for a job that is not running. */
function stepContext(
  tripId: string,
  organiser: string,
  input: unknown,
  results: Record<string, unknown>,
): AgentStepContext {
  return {
    pool: harness.pool,
    agentJob: { id: randomUUID(), tripId, userId: organiser },
    input,
    results,
    usage: {},
  } as unknown as AgentStepContext;
}

describe('a redraft of a draft with an answered wish', () => {
  it(
    'plans from the answers saved with its base version and recounts the must-dos',
    { timeout: 120_000 },
    async () => {
      const { tripId, organiser } = await seedTrip(harness.pool);
      const { rows: trips } = await harness.pool.query<{ destination_id: string }>(
        'SELECT destination_id FROM trips WHERE id = $1',
        [tripId],
      );
      // A curated place that only says where it is: no wish names it, so only the guide can.
      const stage = randomUUID();
      await harness.pool.query(
        `INSERT INTO pois (id, destination_id, name, category, lat, lng, hours, price_level, tags,
           editorial, curation, timezone)
         VALUES ($1, $2, 'Kagura Stage - Lantern Walk', 'nature', 35.0037, 135.7788, $3, null, '{}',
           $4, 'editorial', $5)`,
        [
          stage,
          trips[0]?.destination_id,
          JSON.stringify({ weekly: {} }),
          JSON.stringify({ time_needed_min: 60, must_see: false }),
          RECORDING.city.tz,
        ],
      );
      const { rows: wishes } = await harness.pool.query<{ id: string }>(
        `INSERT INTO must_dos (trip_id, owner_id, title, poi_id)
         VALUES ($1, $2, 'the lantern walk with drums', null) RETURNING id`,
        [tripId, organiser],
      );
      const wish = wishes[0]?.id as string;
      const answer: WishAnswer = {
        wishId: wish,
        poiId: stage,
        dayNo: 2,
        when: 'night',
        weekdays: [],
      };

      // A draft before its outline: the wish names no place of ours.
      const before = await load(stepContext(tripId, organiser, { trip_id: tripId }, {}));
      expect(before.input.pools.unplaceable.map((u) => u.mustDoId)).toContain(wish);

      // The draft's later steps plan with the outline's answers, and the save keeps them.
      const drafted = await load(
        stepContext(
          tripId,
          organiser,
          { trip_id: tripId },
          { skeleton: { skeleton: { wishAnswers: [answer] } } },
        ),
      );
      const { frame } = drafted.input;
      const day = scheduleDay({
        dayNo: 2,
        date: frame.dates[1] as string,
        theme: 'An evening out',
        choices: [{ poiId: stage, kind: 'activity', mustDoId: wish, note: null, when: 'night' }],
        pois: drafted.input.pois,
        window: dayWindow(frame, 1),
        travel: drafted.input.travel,
        bands: drafted.input.bands,
        currency: frame.currency,
        tz: frame.tz,
        idFor: () => randomUUID(),
      });
      const itinerary: Itinerary = { currency: frame.currency, days: [day] };
      const saved = await withSystem(harness.pool, (tx) =>
        persistDraft(tx, {
          jobId: randomUUID(),
          trip: drafted.trip,
          input: drafted.input,
          outcome: {
            itinerary,
            first: { ok: true, violations: [], costPpMinor: 0 },
            loops: 0,
            dropped: [],
          },
          stays: [],
          closures: [],
          slotAvailable: [],
        }),
      );
      const versionId = saved?.versionId as string;
      const { rows: versions } = await harness.pool.query<{ coverage: unknown }>(
        'SELECT coverage FROM itinerary_versions WHERE id = $1',
        [versionId],
      );
      const coverage = draftCoverageSchema.parse(versions[0]?.coverage);
      expect(coverage.wish_answers).toEqual([
        { must_do_id: wish, poi_id: stage, day_no: 2, when: 'night', weekdays: [] },
      ]);
      expect(coverage.must_dos.untimed).toEqual([]);
      expect(coverage.must_dos.missing.map((m) => m.must_do_id)).not.toContain(wish);

      // The redraft has no outline of its own: its input names the version it redoes.
      const redraft = await load(
        stepContext(
          tripId,
          organiser,
          { trip_id: tripId, day: 2, reasons: ['slower'], note: null, base_version: versionId },
          {},
        ),
      );
      expect(redraft.input.frame.mustDos.find((m) => m.id === wish)).toMatchObject({
        poiId: stage,
        when: 'night',
      });
      // A night stop: any day but the last, which ends at noon for the flight home.
      expect(redraft.input.pools.mustDos.find((s) => s.mustDoId === wish)).toEqual({
        mustDoId: wish,
        poiId: stage,
        openDays: [1, 2, 3],
      });
      expect(redraft.input.pools.unplaceable.map((u) => u.mustDoId)).not.toContain(wish);

      // A candidate that kept the stop counts it as made; one that lost it shows it missing.
      const kept = await withSystem(harness.pool, (tx) =>
        candidateCoverage(tx, versionId, itinerary, redraft.input.pois),
      );
      expect(kept?.must_dos.made).toBe(coverage.must_dos.made);
      expect(kept?.must_dos.missing.map((m) => m.must_do_id)).not.toContain(wish);
      expect(kept?.wish_answers).toEqual(coverage.wish_answers);
      const lost = await withSystem(harness.pool, (tx) =>
        candidateCoverage(
          tx,
          versionId,
          { ...itinerary, days: [{ ...day, items: [] }] },
          redraft.input.pois,
        ),
      );
      expect(lost?.must_dos.made).toBe(coverage.must_dos.made - 1);
      expect(lost?.must_dos.missing).toContainEqual({
        must_do_id: wish,
        owner_id: organiser,
        reason: 'dropped',
      });
    },
  );
});
