/**
 * ADD TO COMPARE on a private tour, on the real stack: a trip member puts a partner product on the
 * crew's shortlist with only its product reference, a generic label and the price shown. Adding it
 * again refreshes the price and brings an archived one back; an id that belongs to another trip's
 * driver is refused; someone outside the crew stores nothing.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDriverCommands } from '../../src/commands/drivers';
import {
  buildMoneyCrew,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from '../money/money-harness';
import { buildSetupCrew, errorOf, resultOf, type SignedIn } from '../setup/setup-harness';

let harness: MoneyHarness;
let crew: MoneyCrew;
let organiser: SignedIn;
let member: SignedIn;
let outsider: SignedIn;

const klookCar = (providerId: string, tripId: string, price = 1_250_000) => ({
  provider_id: providerId,
  trip_id: tripId,
  supplier: 'klook',
  product_id: 'activity-4471',
  price_minor: price,
  currency: 'IDR',
  price_unit: 'car',
  included_hours: 10,
  seats: 6,
});

async function provider(id: string) {
  const { rows } = await harness.pool.query<Record<string, unknown>>(
    `SELECT trip_id, kind, name, contact_enc, vehicle, added_by, deleted_at FROM providers
      WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function terms(id: string) {
  const { rows } = await harness.pool.query<Record<string, unknown>>(
    `SELECT trip_id, source, status, seats, price_minor::int AS price_minor,
            currency::text AS currency, price_unit, included_hours::float AS included_hours,
            includes, licence_shown, supplier_ref, confirmed_fields, area, car
       FROM provider_terms WHERE provider_id = $1`,
    [id],
  );
  return rows;
}

beforeAll(async () => {
  harness = await startMoneyHarness((registry) =>
    registerDriverCommands(registry, { keyring: undefined }),
  );
  crew = await buildMoneyCrew(harness, 3);
  [organiser, member] = crew.members as [SignedIn, SignedIn];
  outsider = await harness.signIn();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('shortlist_provider', () => {
  const providerId = generateUuidV7();

  it('adds the product to the trip’s shortlist with its reference, a generic label and the price', async () => {
    const added = await harness.run(
      member,
      'shortlist_provider',
      klookCar(providerId, crew.tripId),
    );
    expect(resultOf(added)).toEqual({ provider_id: providerId });
    expect(await provider(providerId)).toEqual({
      trip_id: crew.tripId,
      kind: 'driver',
      name: 'Klook car',
      contact_enc: null,
      vehicle: null,
      added_by: member.uid,
      deleted_at: null,
    });
    expect(await terms(providerId)).toEqual([
      {
        trip_id: crew.tripId,
        source: 'private_tour',
        status: 'shortlisted',
        seats: 6,
        price_minor: 1_250_000,
        currency: 'IDR',
        price_unit: 'car',
        included_hours: 10,
        includes: { fuel: 'yes', parking: 'yes' },
        licence_shown: true,
        supplier_ref: 'klook:activity-4471',
        confirmed_fields: ['price'],
        area: null,
        car: null,
      },
    ]);
  });

  it('labels a Viator tour as one, priced for the group with no car size or hours', async () => {
    const tourId = generateUuidV7();
    const added = await harness.run(organiser, 'shortlist_provider', {
      provider_id: tourId,
      trip_id: crew.tripId,
      supplier: 'viator',
      product_id: '5589P12',
      price_minor: 18_900,
      currency: 'USD',
      price_unit: 'group',
      included_hours: null,
      seats: null,
    });
    expect(resultOf(added)).toEqual({ provider_id: tourId });
    expect(await provider(tourId)).toMatchObject({ name: 'Viator tour', added_by: organiser.uid });
    expect(await terms(tourId)).toMatchObject([
      {
        price_minor: 18_900,
        currency: 'USD',
        price_unit: 'group',
        included_hours: null,
        seats: null,
        supplier_ref: 'viator:5589P12',
      },
    ]);
  });

  it('refreshes the price on a second add and brings an archived one back, as one row', async () => {
    await withSystem(harness.pool, (tx) =>
      tx.query("UPDATE provider_terms SET status = 'archived' WHERE provider_id = $1", [
        providerId,
      ]),
    );
    const again = await harness.run(
      organiser,
      'shortlist_provider',
      klookCar(providerId, crew.tripId, 1_400_000),
    );
    expect(resultOf(again)).toEqual({ provider_id: providerId });
    expect(await terms(providerId)).toMatchObject([
      { status: 'shortlisted', price_minor: 1_400_000, currency: 'IDR' },
    ]);
    // Whoever added it first stays on the row.
    expect(await provider(providerId)).toMatchObject({ added_by: member.uid });
  });

  it('refuses an id that is already another trip’s driver, leaving theirs alone', async () => {
    const elsewhere = await buildSetupCrew(harness, 1);
    const theirs = generateUuidV7();
    const added = await harness.run(
      elsewhere.organiser,
      'shortlist_provider',
      klookCar(theirs, elsewhere.tripId, 900_000),
    );
    expect(resultOf(added)).toEqual({ provider_id: theirs });

    const taken = await harness.run(member, 'shortlist_provider', klookCar(theirs, crew.tripId));
    expect(errorOf(taken)).toMatchObject({ code: 'VALIDATION', detail: { reason: 'provider_id' } });
    expect(await provider(theirs)).toMatchObject({
      trip_id: elsewhere.tripId,
      added_by: elsewhere.organiser.uid,
    });
    expect(await terms(theirs)).toMatchObject([
      { trip_id: elsewhere.tripId, price_minor: 900_000 },
    ]);
  });

  it('answers NOT_FOUND to someone outside the crew and stores nothing', async () => {
    const id = generateUuidV7();
    const refused = await harness.run(outsider, 'shortlist_provider', klookCar(id, crew.tripId));
    expect(refused.status).toBe(404);
    expect(errorOf(refused)).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'trip' } });
    expect(await provider(id)).toBeUndefined();
    expect(await terms(id)).toEqual([]);
  });
});
