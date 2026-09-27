/**
 * guide_offers / guide_offer_claims: app_system posts an offer, trip members claim a slot for
 * themselves, and the claim trigger keeps `slots_taken` exact under the offer's row lock.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow } from '../helpers/actors';
import { buildPermissionFixture, type PermissionFixture } from '../helpers/fixtures';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;

async function postOffer(slots: number, expiresIn = '1 day'): Promise<string> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO guide_offers (trip_id, kind, slots_total, expires_at, target_ref)
       VALUES ($1, 'join_activity', $2, now() + $3::interval, '{"poi_id":"x"}') RETURNING id`,
      [fixture.tripId, slots, expiresIn],
    );
    return firstRow(rows).id;
  });
}

async function claim(actorUid: string, offerId: string, forUid = actorUid): Promise<void> {
  await withUser(db.pool, actorUid, anonymousActor().device, (tx) =>
    tx.query('INSERT INTO guide_offer_claims (offer_id, trip_id, user_id) VALUES ($1, $2, $3)', [
      offerId,
      fixture.tripId,
      forUid,
    ]),
  );
}

async function offerState(offerId: string): Promise<{ slots_taken: number; status: string }> {
  const { rows } = await withSystem(db.pool, (tx) =>
    tx.query<{ slots_taken: number; status: string }>(
      'SELECT slots_taken, status FROM guide_offers WHERE id = $1',
      [offerId],
    ),
  );
  return firstRow(rows);
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('guide_offers visibility', () => {
  it.each([
    ['outsider', 0],
    ['exMember', 0],
    ['member', 1],
    ['organiser', 1],
  ] as const)('the %s sees %i offer(s) and its claims', async (actor, count) => {
    const offerId = await postOffer(4);
    await claim(fixture.actors.coOrganiser, offerId);
    const seen = await withUser(db.pool, fixture.actors[actor], anonymousActor().device, (tx) =>
      Promise.all([
        tx.query('SELECT 1 FROM guide_offers WHERE id = $1', [offerId]),
        tx.query('SELECT 1 FROM guide_offer_claims WHERE offer_id = $1', [offerId]),
      ]),
    );
    expect(seen.map((r) => r.rowCount)).toEqual([count, count]);
  });

  it('denies an app_user posting an offer', async () => {
    await expect(
      withUser(db.pool, fixture.actors.organiser, anonymousActor().device, (tx) =>
        tx.query(
          "INSERT INTO guide_offers (trip_id, kind, slots_total) VALUES ($1, 'join_activity', 2)",
          [fixture.tripId],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('claiming a slot', () => {
  it('takes slots until the offer is full, then refuses', async () => {
    const offerId = await postOffer(2);
    await claim(fixture.actors.member, offerId);
    expect(await offerState(offerId)).toEqual({ slots_taken: 1, status: 'open' });
    await claim(fixture.actors.organiser, offerId);
    expect(await offerState(offerId)).toEqual({ slots_taken: 2, status: 'full' });
    await expect(claim(fixture.actors.coOrganiser, offerId)).rejects.toThrow(/is closed/);
  });

  it.each(['outsider', 'exMember'] as const)('refuses a claim from an %s', async (actor) => {
    const offerId = await postOffer(3);
    await expect(claim(fixture.actors[actor], offerId)).rejects.toThrow(/row-level security/i);
    expect(await offerState(offerId)).toEqual({ slots_taken: 0, status: 'open' });
  });

  it('refuses claiming on behalf of someone else', async () => {
    const offerId = await postOffer(3);
    await expect(claim(fixture.actors.member, offerId, fixture.actors.organiser)).rejects.toThrow(
      /row-level security/i,
    );
  });

  it('refuses a second claim by the same member and an expired offer', async () => {
    const offerId = await postOffer(3);
    await claim(fixture.actors.member, offerId);
    await expect(claim(fixture.actors.member, offerId)).rejects.toThrow(
      /guide_offer_claims_offer_user_key/,
    );
    const expired = await postOffer(3, '-1 minute');
    await expect(claim(fixture.actors.member, expired)).rejects.toThrow(/is closed/);
  });

  it('releases the slot when app_system drops a claim', async () => {
    const offerId = await postOffer(1);
    await claim(fixture.actors.member, offerId);
    expect(await offerState(offerId)).toEqual({ slots_taken: 1, status: 'full' });
    await withSystem(db.pool, (tx) =>
      tx.query('DELETE FROM guide_offer_claims WHERE offer_id = $1', [offerId]),
    );
    expect(await offerState(offerId)).toEqual({ slots_taken: 0, status: 'open' });
  });
});
