/**
 * A plan built by hand can be sent, on the real stack: with dates locked and a stop of her own on
 * the plan, the organiser takes it to review without a guide draft and builds the proposal from it
 * (sending a built proposal is the proposal suite's). An empty plan and a member are refused.
 */
import { randomUUID } from 'node:crypto';

import { draftCoverageSchema, draftMetricsSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDraftCommands } from '../../../src/commands/draft';
import { registerProposalCommands } from '../../../src/commands/proposal';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const tokyo = (date: string, hour: number) =>
  new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+09:00`).toISOString();

const review = (who: SignedIn, base: string) =>
  harness.run(who, 'review_hand_plan', { trip_id: crew.tripId, base_version: base });

async function trip() {
  const { rows } = await harness.pool.query<{ status: string; draft: string; current: string }>(
    'SELECT status, draft_version_id AS draft, current_version_id AS current FROM trips WHERE id = $1',
    [crew.tripId],
  );
  return rows[0]!;
}

beforeAll(async () => {
  harness = await startSetupHarness((registry) => {
    registerDraftCommands(registry);
    registerProposalCommands(registry);
  });
  crew = await buildSetupCrew(harness, 2);
  const locked = await harness.run(crew.organiser, 'lock_trip_dates', {
    trip_id: crew.tripId,
    start: day(40),
    end: day(42),
  });
  if (locked.status !== 200) throw new Error(JSON.stringify(locked.body));
  await harness.run(crew.organiser, 'ensure_plan_days', { trip_id: crew.tripId });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('review_hand_plan', () => {
  it('refuses an empty plan and a member, then takes her plan to review with its numbers', async () => {
    const [, member] = crew.members as [SignedIn, SignedIn];
    const empty = (await trip()).draft;
    expect(errorOf(await review(crew.organiser, empty))).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'no_stops' },
    });
    const added = await harness.run(crew.organiser, 'apply_draft_ops', {
      trip_id: crew.tripId,
      base_version: empty,
      ops: [
        {
          op: 'add',
          item: randomUUID(),
          new: {
            day_no: 2,
            starts_at: tokyo(day(41), 10),
            ends_at: tokyo(day(41), 12),
            tz: 'Asia/Tokyo',
            custom_place: { name: 'Aunt Mai', lat: 35.01, lng: 135.76 },
            category: 'activity',
            cost_model: 'per_person',
            amount_minor: 1500,
            currency: 'USD',
          },
        },
      ],
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const mine = resultOf<{ version_id: string }>(added).version_id;

    expect(errorOf(await review(member, mine)).code).toBe('FORBIDDEN');
    expect(errorOf(await review(crew.organiser, empty))).toMatchObject({
      code: 'PLAN_VERSION_CONFLICT',
      detail: { latest: mine },
    });
    const reviewed = await review(crew.organiser, mine);
    expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(200);
    expect(await trip()).toEqual({ status: 'draft_review', draft: mine, current: null });
    const { rows } = await harness.pool.query<{ metrics: unknown; coverage: unknown }>(
      'SELECT metrics, coverage FROM itinerary_versions WHERE id = $1',
      [mine],
    );
    const metrics = draftMetricsSchema.parse(rows[0]?.metrics);
    expect(metrics).toMatchObject({ cost_pp_minor: 1500, target_pp_minor: null });
    expect(metrics.days.map((d) => d.stops)).toEqual([0, 1, 0]);
    expect(draftCoverageSchema.parse(rows[0]?.coverage).setup).toMatchObject({
      start_date: day(40),
      end_date: day(42),
    });

    // Once in review it is not set-up any more.
    expect(errorOf(await review(crew.organiser, mine))).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'trip_status' },
    });
  });

  it('builds the proposal from the hand-built plan, as from any draft in review', async () => {
    const mine = (await trip()).draft;
    const built = await harness.run(crew.organiser, 'create_proposal', {
      trip_id: crew.tripId,
      config: {},
    });
    expect(built.status, JSON.stringify(built.body)).toBe(200);
    const { rows } = await harness.pool.query<{ version_id: string; status: string }>(
      'SELECT version_id, status FROM proposals WHERE id = $1',
      [resultOf<{ proposal_id: string }>(built).proposal_id],
    );
    expect(rows[0]).toEqual({ version_id: mine, status: 'building' });
  });
});
