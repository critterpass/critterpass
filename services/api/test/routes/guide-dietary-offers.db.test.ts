/**
 * The dietary profile and guide offer claims through the command door on a migrated Postgres:
 * sharing flags needs the `dietary_visibility` consent, crewmates then see only the derived flags
 * (never the profile), revoking the consent withdraws them, and the owner reads their own profile
 * back decrypted. An offer claim is the member's own, idempotent, bounded by the slots left even
 * when two members race for the last one, and books nothing.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { withUser } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setConsentCommand } from '../../src/commands/consents/set-consent';
import { claimGuideOfferCommand } from '../../src/commands/guide/claim-guide-offer';
import { registerPrivateDietaryRoute } from '../../src/commands/guide/private-dietary';
import { createSetDietaryProfileCommand } from '../../src/commands/guide/set-dietary-profile';
import { seedGuideTrip } from '../ai/guide-action-seed';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from './command-doors-harness';

const keyring = { activeKeyId: 'k1', keys: { k1: randomBytes(32) } };
let harness: CommandDoorsHarness;

beforeAll(async () => {
  harness = await startCommandDoors(
    (registry) => {
      registry.register(setConsentCommand);
      registry.register(createSetDietaryProfileCommand({ keyring }));
      registry.register(claimGuideOfferCommand);
    },
    (app, deps) => registerPrivateDietaryRoute(app, { ...deps, keyring }),
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function send(session: SignedIn, cmd: string, payload: unknown) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(envelope(cmd, payload)),
  });
  return {
    status: response.status,
    body: (await response.json()) as {
      result?: Record<string, unknown>;
      error?: { code: string; detail?: Record<string, unknown> };
    },
  };
}

/** What `uid` can read through RLS. */
async function asUser<R extends object>(uid: string, sql: string, params: unknown[]) {
  return (await withUser(harness.pool, uid, randomUUID(), (tx) => tx.query<R>(sql, params))).rows;
}

const profile = {
  diet: 'vegetarian',
  allergies: ['peanuts'],
  avoid: ['coriander'],
  spice: 'mild',
  accessibility_notes: 'Uses a cane on long stairs',
  visibility: 'crew_flags',
};

describe('set_dietary_profile', () => {
  it('shares flags only with consent, and never the profile itself', async () => {
    const owner = await harness.signInAnonymously();
    const mate = await harness.signInAnonymously();
    const { tripId } = await seedGuideTrip(harness.pool, {
      organiser: owner.uid,
      members: [mate.uid],
    });

    const denied = await send(owner, 'set_dietary_profile', profile);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatchObject({
      code: 'CONSENT_REQUIRED',
      detail: { purpose: 'dietary_visibility' },
    });

    await send(owner, 'set_consent', { purpose: 'dietary_visibility', granted: true });
    const shared = await send(owner, 'set_dietary_profile', profile);
    expect(shared.body.result).toEqual({ visibility: 'crew_flags', flags_shared: true });

    const flags = 'SELECT flags FROM participant_dietary_flags WHERE trip_id = $1 AND user_id = $2';
    expect(await asUser(mate.uid, flags, [tripId, owner.uid])).toEqual([
      { flags: ['no_peanuts', 'vegetarian'] },
    ]);
    expect(
      await asUser(mate.uid, 'SELECT 1 FROM dietary_profiles WHERE user_id = $1', [owner.uid]),
    ).toEqual([]);

    await send(owner, 'set_consent', { purpose: 'dietary_visibility', granted: false });
    expect(await asUser(mate.uid, flags, [tripId, owner.uid])).toEqual([]);
  });

  it('keeps the profile to the owner and reads it back decrypted', async () => {
    const owner = await harness.signInAnonymously();
    const other = await harness.signInAnonymously();
    await send(owner, 'set_dietary_profile', { ...profile, visibility: 'self' });

    const stored = await harness.pool.query<{ accessibility_notes_enc: string }>(
      'SELECT accessibility_notes_enc FROM dietary_profiles WHERE user_id = $1',
      [owner.uid],
    );
    expect(stored.rows[0]?.accessibility_notes_enc).not.toContain('cane');

    const read = (session: SignedIn) =>
      harness.request('/v1/me/private/dietary', { headers: { cookie: session.cookie } });
    const mine = await read(owner);
    expect(mine.headers.get('cache-control')).toBe('private, no-store');
    expect(await mine.json()).toMatchObject({
      diet: 'vegetarian',
      allergies: ['peanuts'],
      avoid: ['coriander'],
      spice: 'mild',
      accessibility_notes: 'Uses a cane on long stairs',
      visibility: 'self',
      consent_at: null,
    });
    expect((await read(other)).status).toBe(404);
  });
});

describe('claim_guide_offer', () => {
  async function offerFor(slots: number, members: number) {
    const people = await Promise.all(
      Array.from({ length: members }, () => harness.signInAnonymously()),
    );
    const [organiser, ...rest] = people;
    const { tripId } = await seedGuideTrip(harness.pool, {
      organiser: organiser!.uid,
      members: rest.map((p) => p.uid),
    });
    const { rows } = await harness.pool.query<{ id: string }>(
      "INSERT INTO guide_offers (trip_id, kind, slots_total) VALUES ($1, 'book_activity', $2) RETURNING id",
      [tripId, slots],
    );
    return { offerId: rows[0]!.id, tripId, people };
  }

  it('is the member’s own confirm, idempotent, and books nothing', async () => {
    const outsider = await harness.signInAnonymously();
    const { offerId, tripId, people } = await offerFor(3, 2);
    const [me] = people;

    expect(
      (await send(outsider, 'claim_guide_offer', { offer_id: offerId })).body.error,
    ).toMatchObject({ code: 'NOT_FOUND' });
    const first = await send(me!, 'claim_guide_offer', { offer_id: offerId });
    expect(first.body.result).toEqual({
      offer_id: offerId,
      already_claimed: false,
      slots_taken: 1,
      slots_total: 3,
    });
    const again = await send(me!, 'claim_guide_offer', { offer_id: offerId });
    expect(again.body.result).toMatchObject({ already_claimed: true, slots_taken: 1 });

    const claims = await harness.pool.query(
      'SELECT user_id FROM guide_offer_claims WHERE offer_id = $1',
      [offerId],
    );
    expect(claims.rows).toEqual([{ user_id: me!.uid }]);
    const bookings = await harness.pool.query('SELECT 1 FROM bookings WHERE trip_id = $1', [
      tripId,
    ]);
    expect(bookings.rowCount).toBe(0);
  });

  it('gives the last slot to exactly one of two racing members', async () => {
    const { offerId, people } = await offerFor(2, 3);
    const [first, second, third] = people;
    await send(first!, 'claim_guide_offer', { offer_id: offerId });

    const race = await Promise.all([
      send(second!, 'claim_guide_offer', { offer_id: offerId }),
      send(third!, 'claim_guide_offer', { offer_id: offerId }),
    ]);
    const won = race.filter((r) => r.status === 200);
    const lost = race.filter((r) => r.status !== 200);
    expect(won).toHaveLength(1);
    expect(lost[0]?.body.error).toMatchObject({
      code: 'STATE_INVALID',
      detail: { state: 'offer_full' },
    });
    const offer = await harness.pool.query(
      'SELECT slots_taken, status FROM guide_offers WHERE id = $1',
      [offerId],
    );
    expect(offer.rows).toEqual([{ slots_taken: 2, status: 'full' }]);
  });
});
