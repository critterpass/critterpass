/**
 * Lab scenes for a driver's price as he gave it, on this account's current trip: the check card
 * (6c-2) with no one price to quote, with prices by vehicle, per person and as a range, and the
 * comparison (6d-1) of four such drivers. The cards are fixtures; nothing is read or saved.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values and SQL, only in the (dev) lab. */
import type { IntakeItem, ParsedIntake } from '@cp/domain';
import type { ReactNode } from 'react';

import { CompareScreen } from '../../compare/CompareScreen';
import { CheckCardScreen } from '../../intake/check/CheckCardScreen';
import { rememberIntake } from '../../intake/intake-store';
import type { DriversApi, ShortlistDriver } from '../api';
import { useLiveRows } from '../use-live-rows';
import { PRICE_FIXTURES, type PriceFixtureName } from './price-fixtures';

const idOf = (kind: 'a' | 'b', index: number) =>
  `0199d000-0000-7000-8000-00000000${kind}${String(index).padStart(3, '0')}`;
const NAMES = Object.keys(PRICE_FIXTURES) as PriceFixtureName[];
const parsedOf = (name: PriceFixtureName): ParsedIntake => PRICE_FIXTURES[name].parsed;

/** The account's latest trip, which gives the scenes real days and a crew size. */
function useLabTrip(): string | null {
  const { rows } = useLiveRows<{ id: string }>(
    `SELECT id FROM trips WHERE status <> 'cancelled' ORDER BY start_date DESC, id LIMIT 1`,
    [],
    ['trips'],
  );
  return rows[0]?.id ?? null;
}

function CheckScene({ name }: { readonly name: PriceFixtureName }) {
  const tripId = useLabTrip();
  if (tripId === null) return null;
  const intakeId = idOf('a', NAMES.indexOf(name));
  rememberIntake({
    intakeId,
    kind: 'text',
    text: PRICE_FIXTURES[name].text,
    parsed: parsedOf(name),
    sharedBy: null,
  });
  return <CheckCardScreen tripId={tripId} intakeId={intakeId} />;
}

const COMPARED: readonly PriceFixtureName[] = ['ask', 'person', 'range', 'hour'];

/** The shortlist as the api answers it once each card was confirmed as read. */
const shortlist: Awaited<ReturnType<DriversApi['read']>> = {
  kind: 'ok',
  value: {
    drivers: COMPARED.map((name, index): ShortlistDriver => {
      const { card } = parsedOf(name);
      return {
        id: idOf('b', index),
        name: card.name ?? '',
        phone: card.phone,
        vehicle: null,
        added_by: null,
        terms: {
          source: 'found',
          status: 'shortlisted',
          area: card.area,
          languages: card.languages,
          car: card.car,
          seats: card.seats,
          price_minor: card.price_minor,
          currency: card.currency,
          price_unit: card.price_unit,
          included_hours: card.included_hours,
          includes: card.includes,
          overtime_minor: card.overtime_minor,
          licence_shown: card.licence_shown,
          supplier_ref: null,
        },
      };
    }),
    intake: COMPARED.map((name, index): IntakeItem => ({
      id: idOf('a', NAMES.indexOf(name)),
      kind: 'text',
      status: 'used',
      shared_by: idOf('b', 900),
      shared_by_name: null,
      text: PRICE_FIXTURES[name].text,
      parsed: parsedOf(name),
      provider_id: idOf('b', index),
      created_at: '2026-10-07T03:00:00.000Z',
    })),
  },
};

const fixtureApi: DriversApi = {
  read: () => Promise.resolve(shortlist),
  readIntake: () => Promise.resolve({ kind: 'offline' }),
  privateTours: () => Promise.resolve({ kind: 'offline' }),
};

function CompareScene() {
  const tripId = useLabTrip();
  return tripId === null ? null : <CompareScreen tripId={tripId} api={fixtureApi} />;
}

export const PRICE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'price-check-ask': () => <CheckScene name="ask" />,
  'price-check-tiers': () => <CheckScene name="tiers" />,
  'price-check-person': () => <CheckScene name="person" />,
  'price-check-range': () => <CheckScene name="range" />,
  'price-compare': () => <CompareScene />,
};
