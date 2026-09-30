/**
 * The calendar feed on the real stack, parsed back with ical.js: a member's feed holds the items
 * they attend with their own personal changes, each event keyed by the item's stable id with the
 * right instant; revoking (or a made-up token) answers 404, and only the trip's crew gets a feed.
 */
import ICAL from 'ical.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPlanCommands } from '../../src/commands/plan';
import { registerPlanRoutes } from '../../src/plan/routes';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../setup/setup-harness';
import { seedCurrentPlan, tokyo, type SeededPlan } from './plan-fixture';

let harness: SetupHarness;
let crew: SetupCrew;
let plan: SeededPlan;

beforeAll(async () => {
  harness = await startSetupHarness(registerPlanCommands, (app, deps) =>
    registerPlanRoutes(app, deps),
  );
  crew = await buildSetupCrew(harness, 2);
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

function events(ics: string): Map<string, ICAL.Component> {
  const calendar = ICAL.Component.fromString(ics);
  return new Map(
    calendar
      .getAllSubcomponents('vevent')
      .map((event) => [String(event.getFirstPropertyValue('uid')), event]),
  );
}

describe('calendar feed', () => {
  it('serves my plan with my own changes, and stops once revoked', async () => {
    const [organiser, me] = crew.members as [SignedIn, SignedIn];
    const outsider = await harness.signIn();
    expect(
      errorOf(await harness.run(outsider, 'create_calendar_feed', { trip_id: crew.tripId })).code,
    ).toBe('NOT_FOUND');

    // The dinner is for the organiser only; my museum visit is later, for me alone.
    await harness.pool.query(
      `UPDATE plan_items SET attendee_ids = ARRAY[$3]::uuid[]
        WHERE version_id = $1 AND stable_id = $2`,
      [plan.versionId, plan.dinner, organiser.uid],
    );
    const created = await harness.run(me, 'create_changeset', {
      trip_id: crew.tripId,
      base_version: plan.versionId,
      ops: [
        {
          op: 'retime',
          target: plan.museum,
          after: {
            starts_at: tokyo(plan.dates[1] as string, 15),
            ends_at: tokyo(plan.dates[1] as string, 17),
          },
          reason: 'later for me',
          affected_user_ids: [me.uid],
          booking_impact: false,
        },
      ],
    });
    const { change_set_id: id } = resultOf<{ change_set_id: string }>(created);
    await harness.run(me, 'apply_changeset', { changeset_id: id, scope: 'personal' });

    const { path } = resultOf<{ path: string }>(
      await harness.run(me, 'create_calendar_feed', { trip_id: crew.tripId }),
    );
    const response = await harness.request(path);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/calendar');
    const feed = events(await response.text());
    expect([...feed.keys()].sort()).toEqual(
      [plan.walk, plan.museum].map((stable) => `${stable}@critterpass.app`).sort(),
    );
    const museum = feed.get(`${plan.museum}@critterpass.app`);
    const start = museum?.getFirstPropertyValue('dtstart') as ICAL.Time;
    expect(start.toJSDate().toISOString()).toBe(tokyo(plan.dates[1] as string, 15));
    const walk = feed.get(`${plan.walk}@critterpass.app`);
    expect((walk?.getFirstPropertyValue('dtend') as ICAL.Time).toJSDate().toISOString()).toBe(
      tokyo(plan.dates[0] as string, 11),
    );

    expect((await harness.run(me, 'revoke_calendar_feed', { trip_id: crew.tripId })).status).toBe(
      200,
    );
    expect((await harness.request(path)).status).toBe(404);
    expect(
      (await harness.request(`/v1/trips/${crew.tripId}/calendar.ics?token=${'x'.repeat(43)}`))
        .status,
    ).toBe(404);
  });
});
