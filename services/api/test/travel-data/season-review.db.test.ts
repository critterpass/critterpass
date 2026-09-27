/**
 * The season review gate over the real stack: a web research candidate waits in the review queue
 * with its source and never reaches `/v1/destinations/{id}` until a content reviewer approves it;
 * a rejected candidate is removed; both decisions are audited and content-role only.
 */
import { withSystem } from '@cp/db';
import type { PolicyActor } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DestinationInsights } from '../../src/travel-data/destination-route';
import { registerTravelDataRoutes } from '../../src/travel-data/routes';
import { handleReviewSeasonEvent, listSeasonReviewQueue } from '../../src/travel-data/season-admin';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';
import { seedLiveDestinations } from './travel-seed';

const CONTENT: PolicyActor = {
  uid: crypto.randomUUID(),
  isAnonymous: false,
  roles: ['content'],
  via: 'app',
};

let harness: CommandDoorsHarness;
let kyoto: string;

function monthAhead(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
}

/** Queues a candidate the way the research job writes it: unreviewed, cited, web-sourced. */
async function queueCandidate(key: string, name: string): Promise<string> {
  const month = monthAhead(2);
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, confidence,
       source, source_url, sourced_on)
     VALUES ($1, $2, 'festival', $3, $4::date + 4, $4::date + 6, 'confirmed', 'web: kyoto.travel',
             'https://kyoto.travel/en/events', CURRENT_DATE)
     RETURNING id`,
    [kyoto, key, name, `${month}-01`],
  );
  return rows[0]?.id ?? '';
}

async function servedEventKeys(): Promise<string[]> {
  const me = await harness.signInAnonymously();
  const response = await harness.request(
    `/v1/destinations/${kyoto}?origins=SIN&month=${monthAhead(2)}`,
    { headers: { cookie: me.cookie } },
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as DestinationInsights;
  return body.events.map((event) => event.key);
}

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerTravelDataRoutes(app, deps),
  );
  kyoto = (await seedLiveDestinations(harness.pool))['kyoto'] ?? '';
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('season review gate', () => {
  it('lists a queued candidate with its source and serves it only after approval', async () => {
    const id = await queueCandidate('web-lantern-walk-2026', 'Lantern walk');
    expect(await servedEventKeys()).not.toContain('web-lantern-walk-2026');

    const queue = await withSystem(harness.pool, (tx) => listSeasonReviewQueue(tx, CONTENT, kyoto));
    expect(queue).toContainEqual(
      expect.objectContaining({
        id,
        name: 'Lantern walk',
        source: 'web: kyoto.travel',
        source_url: 'https://kyoto.travel/en/events',
      }),
    );

    await withSystem(harness.pool, (tx) =>
      handleReviewSeasonEvent(tx, CONTENT, { event_id: id, decision: 'approve' }),
    );
    expect(await servedEventKeys()).toContain('web-lantern-walk-2026');
    const after = await withSystem(harness.pool, (tx) => listSeasonReviewQueue(tx, CONTENT));
    expect(after.map((row) => row.id)).not.toContain(id);
  });

  it('removes a rejected candidate, which is never served', async () => {
    const id = await queueCandidate('web-misdated-fair-2026', 'Misdated fair');
    await withSystem(harness.pool, (tx) =>
      handleReviewSeasonEvent(tx, CONTENT, { event_id: id, decision: 'reject' }),
    );
    expect(await servedEventKeys()).not.toContain('web-misdated-fair-2026');
    const { rows } = await harness.pool.query('SELECT 1 FROM season_events WHERE id = $1', [id]);
    expect(rows).toEqual([]);
    await expect(
      withSystem(harness.pool, (tx) =>
        handleReviewSeasonEvent(tx, CONTENT, { event_id: id, decision: 'approve' }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('audits each decision', async () => {
    const { rows } = await harness.pool.query<{ action: string }>(
      `SELECT action FROM ops.admin_audit WHERE target_kind = 'season_event' ORDER BY at`,
    );
    expect(rows.map((row) => row.action)).toEqual([
      'review_season_event.approve',
      'review_season_event.reject',
    ]);
  });

  it('is content-role only', async () => {
    const id = await queueCandidate('web-support-attempt-2026', 'Support attempt');
    const support = { ...CONTENT, roles: ['support'] } as PolicyActor;
    await expect(
      withSystem(harness.pool, (tx) =>
        handleReviewSeasonEvent(tx, support, { event_id: id, decision: 'approve' }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      withSystem(harness.pool, (tx) => listSeasonReviewQueue(tx, support)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await servedEventKeys()).not.toContain('web-support-attempt-2026');
  });
});
