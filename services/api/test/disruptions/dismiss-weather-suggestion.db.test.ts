/**
 * Turning down the guide's weather move on the real stack. A crew member dismisses the suggestion
 * by its change set: the change set is rejected, the suggestion is withdrawn and remembered as
 * dismissed (so the replan leaves that item alone), the plan channel is told and the dismissal is
 * recorded once. Someone outside the crew, and a change set that is not a weather suggestion,
 * find nothing.
 */
import { randomUUID } from 'node:crypto';

import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dismissWeatherSuggestionCommand } from '../../src/commands/disruptions/dismiss-weather-suggestion';
import { seedCurrentPlan, type SeededPlan } from '../plan/plan-fixture';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../setup/setup-harness';

/** The facts the weather replan keeps on its suggestion. */
const FACTS = { from: '09:00', to: '14:00', chance: 80 };

let harness: SetupHarness;
let crew: SetupCrew;
let member: SignedIn;
let outsider: SignedIn;
let plan: SeededPlan;
let weather: { changeSetId: string; disruptionId: string };
let storm: { changeSetId: string; disruptionId: string };

/**
 * A proposed change set with its open disruption, as the disruption jobs leave them. Seeded as
 * the migration owner.
 */
async function suggestion(kind: 'weather' | 'storm', cause: 'rain' | 'wind') {
  const tx = harness.pool;
  const ops = [
    {
      op: 'retime',
      target: plan.walk,
      before: { starts_at: '2026-11-17T00:00:00.000Z' },
      after: { starts_at: '2026-11-17T05:00:00.000Z', ends_at: '2026-11-17T07:00:00.000Z' },
      reason: 'Rain until early afternoon',
      affected_user_ids: crew.members.map((person) => person.uid),
      booking_impact: false,
    },
  ];
  const set = await tx.query<{ id: string }>(
    `INSERT INTO change_sets (trip_id, base_version_id, trigger, scope, author_kind, author_id,
         status, ops, cost_delta_minor)
       VALUES ($1, $2, 'weather', 'group', 'guide', $3, 'draft', $4, 0) RETURNING id`,
    [crew.tripId, plan.versionId, randomUUID(), JSON.stringify(ops)],
  );
  const changeSetId = set.rows[0]!.id;
  await tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [changeSetId]);
  const disruption = await tx.query<{ id: string }>(
    `INSERT INTO disruptions (trip_id, kind, cause, dedupe_key, title, summary, affected, facts,
         change_set_id)
       VALUES ($1, $2, $3, $4, 'Rain on your walk', 'Move it to the afternoon?', $5, $6, $7)
       RETURNING id`,
    [
      crew.tripId,
      kind,
      cause,
      `${kind}:${randomUUID()}`,
      JSON.stringify({ traveller_ids: [], item_stable_ids: [plan.walk], unaffected_ids: [] }),
      JSON.stringify(FACTS),
      changeSetId,
    ],
  );
  return { changeSetId, disruptionId: disruption.rows[0]!.id };
}

async function state(of: { changeSetId: string; disruptionId: string }) {
  const { rows } = await harness.pool.query<Record<string, unknown>>(
    `SELECT c.status AS change_set, d.status, d.version, d.facts, d.chosen_by,
            d.resolved_at IS NOT NULL AS resolved
       FROM disruptions d JOIN change_sets c ON c.id = d.change_set_id
      WHERE d.id = $1 AND c.id = $2`,
    [of.disruptionId, of.changeSetId],
  );
  return rows[0];
}

async function dismissedEvents(changeSetId: string) {
  const { rows } = await harness.pool.query<Record<string, unknown>>(
    `SELECT actor_kind, actor_id, crew_id, trip_id, payload FROM domain_events
      WHERE type = 'weather.suggestion_dismissed' AND aggregate_id = $1`,
    [changeSetId],
  );
  return rows;
}

async function planHints(changeSetId: string) {
  const { rows } = await harness.pool.query<{ payload: { type: string; data: unknown } }>(
    `SELECT payload FROM rt_outbox
      WHERE channel = $1 AND payload->'data'->>'change_set_id' = $2 ORDER BY id`,
    [`trip_plan:${crew.tripId}`, changeSetId],
  );
  return rows.map((row) => ({ type: row.payload.type, data: row.payload.data }));
}

const dismiss = (who: SignedIn, changeSetId: string) =>
  harness.run(who, 'dismiss_weather_suggestion', { changeset_id: changeSetId });

const UNTOUCHED = {
  change_set: 'proposed',
  status: 'open',
  version: 1,
  facts: FACTS,
  chosen_by: null,
  resolved: false,
};

beforeAll(async () => {
  harness = await startSetupHarness((registry) =>
    registry.register(dismissWeatherSuggestionCommand),
  );
  crew = await buildSetupCrew(harness, 3);
  member = crew.members[1]!;
  outsider = await harness.signIn();
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
  weather = await suggestion('weather', 'rain');
  storm = await suggestion('storm', 'wind');
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('dismiss_weather_suggestion', () => {
  it('finds nothing for someone outside the crew, or for a change set nobody suggested', async () => {
    const byOutsider = await dismiss(outsider, weather.changeSetId);
    expect(byOutsider.status).toBe(404);
    expect(errorOf(byOutsider)).toMatchObject({
      code: 'NOT_FOUND',
      detail: { reason: 'suggestion' },
    });
    const unknown = await dismiss(member, generateUuidV7());
    expect(errorOf(unknown)).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'suggestion' } });
    expect(await state(weather)).toEqual(UNTOUCHED);
    expect(await dismissedEvents(weather.changeSetId)).toEqual([]);
  });

  it('is for weather moves only: a storm’s change set is left alone', async () => {
    const refused = await dismiss(member, storm.changeSetId);
    expect(errorOf(refused)).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'suggestion' } });
    expect(await state(storm)).toEqual(UNTOUCHED);
  });

  it('rejects the move, withdraws the suggestion as dismissed and tells the plan', async () => {
    const dismissed = await dismiss(member, weather.changeSetId);
    expect(resultOf(dismissed)).toEqual({ dismissed: true, status: 'withdrawn' });
    expect(await state(weather)).toEqual({
      change_set: 'rejected',
      status: 'withdrawn',
      version: 2,
      facts: { ...FACTS, dismissed: 'yes' },
      chosen_by: member.uid,
      resolved: true,
    });
    expect(await planHints(weather.changeSetId)).toEqual([
      {
        type: 'forecast.band',
        data: {
          disruption_id: weather.disruptionId,
          change_set_id: weather.changeSetId,
          withdrawn: true,
        },
      },
    ]);
    expect(await dismissedEvents(weather.changeSetId)).toEqual([
      {
        actor_kind: 'user',
        actor_id: member.uid,
        crew_id: crew.crewId,
        trip_id: crew.tripId,
        payload: { trip_id: crew.tripId, change_set_id: weather.changeSetId },
      },
    ]);
    expect(await state(storm)).toEqual(UNTOUCHED);
  });

  it('answers a second dismissal with where it stands, changing and announcing nothing', async () => {
    const again = await dismiss(crew.organiser, weather.changeSetId);
    expect(resultOf(again)).toEqual({ dismissed: false, status: 'withdrawn' });
    expect(await state(weather)).toMatchObject({ version: 2, chosen_by: member.uid });
    expect(await planHints(weather.changeSetId)).toHaveLength(1);
    expect(await dismissedEvents(weather.changeSetId)).toHaveLength(1);
  });
});
