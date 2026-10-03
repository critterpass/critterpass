/**
 * Editorial crowd curves in the database: proposals are stored unapproved and never replace an
 * approved curve; approval is attributed to an ops operator in the admin audit; Đà Nẵng is left
 * alone until the founder is back.
 */
import { randomUUID } from 'node:crypto';

import { createPool, runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  approveCrowdCurves,
  placesWithoutCurves,
  storeCrowdProposals,
} from '../src/kinds/places/crowds';
import { readCrowdReview } from '../src/kinds/places/crowds-review';
import { seedFixturePois } from './places-fixture';

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let poiId: string;
const NOW = new Date('2026-10-05T09:00:00+07:00');
const OPERATOR = 'ops@critterpass.test';
const week = (level: number) =>
  Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, (_, h) => (h >= 8 && h < 18 ? level + h : 0)),
  );

beforeAll(async () => {
  container = await startPostgres();
  pool = createPool(container.getConnectionUri());
  await runMigrations(pool);
  await seedFixturePois(pool);
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE pois SET curation = 'editorial',
            hours = '{"weekly":{"mo":[{"start":"08:00","end":"18:00"}],"sa":[{"start":"08:00","end":"18:00"}]}}'
      WHERE id = (SELECT id FROM pois ORDER BY name LIMIT 1) RETURNING id`,
  );
  poiId = rows[0]?.id ?? '';
  await pool.query(
    `INSERT INTO auth."user" (id, name, email, role) VALUES ($1, 'Ops', $2, 'owner')`,
    [randomUUID(), OPERATOR],
  );
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

const curves = async (approved: boolean) =>
  (
    await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM crowd_forecasts
        WHERE poi_id = $1 AND source = 'editorial' AND (approved_at IS NOT NULL) = $2`,
      [poiId, approved],
    )
  ).rows[0]?.n;

describe('editorial crowd curve proposals and approval', () => {
  it('asks only for curated places with hours and no curve yet', async () => {
    const places = await placesWithoutCurves(pool, ['bali']);
    expect(places.map((place) => place.id)).toEqual([poiId]);
  });

  it('stores a proposal unapproved and shows it on the review page', async () => {
    await storeCrowdProposals(pool, [{ poiId, week: week(20) }], NOW);
    expect(await curves(false)).toBe(7);
    expect(await placesWithoutCurves(pool, ['bali'])).toEqual([]);
    const review = await readCrowdReview(pool, ['bali']);
    expect(review[0]?.places).toHaveLength(1);
  });

  it('approval needs an operator, then records who approved it', async () => {
    await expect(
      approveCrowdCurves(pool, {
        destinations: ['bali'],
        approverEmail: 'someone@else.test',
        batchKey: 'b1',
        now: NOW,
      }),
    ).rejects.toThrow('not an ops operator');
    expect(await curves(false)).toBe(7);
    const places = await approveCrowdCurves(pool, {
      destinations: ['bali'],
      approverEmail: OPERATOR,
      batchKey: 'b1',
      now: NOW,
    });
    expect(places).toBe(1);
    expect(await curves(true)).toBe(7);
    const audit = await pool.query<{ action: string; email: string; detail: { curves: number } }>(
      `SELECT a.action, u.email, a.detail FROM ops.admin_audit a JOIN auth."user" u ON u.id = a.admin_id`,
    );
    expect(audit.rows.map((row) => [row.action, row.email, row.detail.curves])).toEqual([
      ['crowd_curves.approve', OPERATOR, 7],
    ]);
  });

  it('a new proposal never replaces an approved curve', async () => {
    await storeCrowdProposals(pool, [{ poiId, week: week(60) }], NOW);
    const { rows } = await pool.query<{ level: number }>(
      `SELECT hourly[11] AS level FROM crowd_forecasts WHERE poi_id = $1 AND dow = 1 AND source = 'editorial'`,
      [poiId],
    );
    expect(rows[0]?.level).toBe(30);
  });
});
