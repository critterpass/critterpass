/**
 * Fixes timed on real travel, on the real stack with recorded router answers for an Ubud day: the
 * best order makes a pair the plan never had, the router is asked for it and the order is offered
 * on the routed minutes (`checked`); a router that does not answer inside the budget leaves the
 * order offered as an estimate (`checked: false`); and a one-tap fix that would leave less time
 * than the routed drive between two stops is refused, the plan untouched, while one that leaves
 * room is applied.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withSystem } from '@cp/db';
import { createPlanningTravel, createValhallaClient } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCheckCommands } from '../../../src/commands/checks';
import { planStaySource, type TravelSource } from '../../../src/planning/fit/context';
import type { FixerDeps } from '../../../src/planning/fixers/check-input';
import { registerFixerRoutes } from '../../../src/planning/fixers/routes';
import { planningFitTravel } from '../../../src/routing/travel-modes';
import { seedCurrentPlan, tokyo, type SeededPlan } from '../../plan/plan-fixture';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from '../../setup/setup-harness';
import { SARASWATI, TEGALLALANG, type RecordedExchange } from './fixtures/record-ubud-pair';

const TIRTA_EMPUL = { lat: -8.4153, lng: 115.3154 };
const recorded = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/ubud-pair.json'), 'utf8'),
) as RecordedExchange[];

/** The recorded router at the fetch boundary; an unrecorded request fails. */
const replay = (input: string | URL, init?: RequestInit): Promise<Response> => {
  const path = new URL(input).pathname;
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
  const match = recorded.find(
    (exchange) =>
      exchange.path === path && JSON.stringify(exchange.request) === JSON.stringify(body),
  );
  if (match === undefined) return Promise.reject(new Error(`unrecorded ${path}`));
  return Promise.resolve(
    new Response(JSON.stringify(match.response), {
      status: match.status,
      headers: { 'content-type': 'application/json' },
    }),
  );
};
const silent = (): Promise<Response> => new Promise(() => undefined);

const travelOn = (fetch: typeof replay) =>
  planningFitTravel(
    createPlanningTravel({
      valhalla: createValhallaClient({ baseUrl: 'http://valhalla.test:8002', fetch }),
    }),
  );
let router: (driveFactor: number, walkMaxM: number) => TravelSource = travelOn(replay);
const deps: FixerDeps = {
  stays: planStaySource,
  now: () => new Date(),
  travel: (driveFactor, walkMaxM) => router(driveFactor, walkMaxM),
};

let harness: SetupHarness;
let crew: SetupCrew;
let plan: SeededPlan;
const stops = { temple: randomUUID(), spring: randomUUID(), terraces: randomUUID() };

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function current(): Promise<{ versionId: string; dayId: string }> {
  const [row] = await q<{ version: string; day: string }>(
    `SELECT t.current_version_id AS version, d.id AS day FROM trips t
       JOIN plan_days d ON d.version_id = t.current_version_id AND d.day_no = 3 WHERE t.id = $1`,
    [crew.tripId],
  );
  return { versionId: row!.version, dayId: row!.day };
}

const at = (hour: number, minute = 0) =>
  new Date(Date.parse(tokyo(plan.dates[2]!, hour)) + minute * 60_000).toISOString();

async function startsOf(stable: string): Promise<string> {
  const [row] = await q<{ starts_at: Date }>(
    `SELECT i.starts_at FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
      WHERE t.id = $1 AND i.stable_id = $2`,
    [crew.tripId, stable],
  );
  return row!.starts_at.toISOString();
}

/** A clash issue whose one-tap fix puts the terraces right after the temple. */
async function terracesFix(fromMinute: number, toMinute: number): Promise<string> {
  const { versionId, dayId } = await current();
  const [row] = await q<{ id: string }>(
    `INSERT INTO plan_check_issues (trip_id, version_id, kind, severity, day_id, stable_ids, params,
       fix, rank, fingerprint)
     VALUES ($1, $2, 'clash', 'fix', $3, $4::uuid[], $5, $6, 0, $7) RETURNING id`,
    [
      crew.tripId,
      versionId,
      dayId,
      [stops.spring, stops.terraces],
      JSON.stringify({ first: stops.spring, second: stops.terraces, short_minutes: 5 }),
      JSON.stringify({
        kind: 'apply',
        ops: [
          {
            op: 'retime',
            target: stops.terraces,
            before: { starts_at: at(13), ends_at: at(14) },
            after: { starts_at: at(10, fromMinute), ends_at: at(10, toMinute) },
            reason: 'check_fix_clash',
            affected_user_ids: [],
            booking_impact: false,
          },
        ],
      }),
      randomUUID(),
    ],
  );
  return row!.id;
}

beforeAll(async () => {
  harness = await startSetupHarness(
    (registry) => registerCheckCommands(registry, deps),
    (app, doors) => registerFixerRoutes(app, doors, deps),
  );
  crew = await buildSetupCrew(harness, 2);
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
  const { versionId, dayId } = await current();
  // The free third day: the temple in town, the spring far north-east, then back to the terraces
  // half-way. The plan's two pairs are stored; temple to terraces was never routed.
  const item = (stable: string, hour: number, place: { lat: number; lng: number }) =>
    q(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
         category, custom_place)
       VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Tokyo', 'sight', $7)`,
      [
        versionId,
        dayId,
        crew.tripId,
        stable,
        at(hour),
        at(hour + 1),
        JSON.stringify({ name: 'A place in Ubud', ...place }),
      ],
    );
  // A booked dinner without a place, so the day runs into the evening and an order has room.
  await q(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
       category, locked_reason)
     VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Tokyo', 'dinner', 'booking')`,
    [versionId, dayId, crew.tripId, randomUUID(), at(19), at(20)],
  );
  await item(stops.temple, 9, SARASWATI);
  await item(stops.spring, 11, TIRTA_EMPUL);
  await item(stops.terraces, 13, TEGALLALANG);
  for (const [from, to, minutes] of [
    [stops.temple, stops.spring, 36],
    [stops.spring, stops.terraces, 14],
  ] as const) {
    await q(
      `INSERT INTO plan_legs (trip_id, version_id, day_id, from_key, to_key, mode, minutes, meters,
                              source, approx)
       VALUES ($1, $2, $3, $4, $5, 'drive', $6, 9000, 'valhalla', false)`,
      [crew.tripId, versionId, dayId, from, to, minutes],
    );
  }
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

interface ReorderBody {
  found: boolean;
  checked?: boolean;
  before?: { drive_min: number };
  after?: { order: string[]; drive_min: number };
}

async function reorder(): Promise<ReorderBody> {
  const { dayId } = await current();
  const response = await harness.request(`/v1/trips/${crew.tripId}/days/${dayId}/reorder`, {
    headers: { cookie: crew.organiser.cookie },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as ReorderBody;
}

/** The new order's stops with a place (the booked dinner has none). */
const visits = (body: ReorderBody) =>
  (body.after?.order ?? []).filter((id) => (Object.values(stops) as string[]).includes(id));

describe('fixes timed on real travel', () => {
  it('routes the pair the new order makes and offers the order on the routed minutes', async () => {
    router = travelOn(replay);
    const body = await reorder();
    expect(body.found).toBe(true);
    expect(body.checked).toBe(true);
    expect(visits(body)).toEqual([stops.temple, stops.terraces, stops.spring]);
    expect(body.before?.drive_min).toBe(50);
    // 17 routed minutes temple to terraces, then the stored 14 on to the spring.
    expect(body.after?.drive_min).toBe(31);
  });

  it('offers the order as an estimate when the router does not answer in time', async () => {
    router = travelOn(silent);
    const body = await reorder();
    expect(body).toMatchObject({ found: true, checked: false });
    expect(visits(body)).toEqual([stops.temple, stops.terraces, stops.spring]);
  }, 30_000);

  it('refuses a one-tap fix that leaves less time than the routed drive', async () => {
    router = travelOn(replay);
    const { versionId } = await current();
    // Ten minutes after the temple ends, for a 17-minute drive.
    const refused = await harness.run(crew.organiser, 'apply_check_fix', {
      issue_id: await terracesFix(10, 40),
      base_version: versionId,
    });
    expect(errorOf(refused)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'fix_would_clash' },
    });
    expect(await startsOf(stops.terraces)).toBe(at(13));
    expect((await current()).versionId).toBe(versionId);

    // Twenty minutes after the temple, fifteen before the spring: both drives fit.
    const applied = await harness.run(crew.organiser, 'apply_check_fix', {
      issue_id: await terracesFix(20, 45),
      base_version: versionId,
    });
    expect(resultOf<{ applied: boolean }>(applied).applied).toBe(true);
    expect(await startsOf(stops.terraces)).toBe(at(10, 20));
  });
});
