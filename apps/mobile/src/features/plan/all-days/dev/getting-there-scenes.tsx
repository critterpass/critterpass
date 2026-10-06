/**
 * Lab scenes for "Getting there" on All days over the Bali Six's trip: the ways from Ho Chi Minh
 * City with their estimates and pages, the wait while they are written, none found, and a read
 * that failed. Nothing is fetched; "Try again" does nothing.
 */
/* eslint-disable lingui/no-unlocalized-strings -- scene names and lab data, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import type { GettingThereState } from '@/data/areas/use-getting-there';

import { labTripModel } from '../../trip-map/dev/bali-trip';
import { AllDaysView } from '../all-days-view';

const noop = () => undefined;
const HOME = { key: 'SGN', city: 'Ho Chi Minh City' };
const GUIDE_PAGE = {
  url: 'https://example.com/ho-chi-minh-city-to-bali',
  title: 'Ho Chi Minh City to Bali: every way to go',
};

const READY: GettingThereState = {
  status: 'ready',
  origin: HOME,
  generatedAt: '2026-10-05T08:12:00.000Z',
  saved: false,
  ways: [
    {
      mode: 'flight',
      minutes: 235,
      cost: { amountMinor: 4_200_000, currency: 'VND' },
      note: 'Direct flights land at Denpasar, half an hour from Seminyak.',
      sources: [GUIDE_PAGE],
    },
    {
      mode: 'boat',
      minutes: 4320,
      cost: null,
      note: 'Only on a cruise that calls at Benoa.',
      sources: [{ url: 'https://ferries.example.org/benoa', title: null }],
    },
  ],
};

function GettingThereScene({ state }: { readonly state: GettingThereState }) {
  const [model] = useState(() => labTripModel({ organiser: true }));
  return (
    <AllDaysView
      model={model}
      from={model.days[2] ?? null}
      over={null}
      dragging={false}
      measureKey={0}
      gettingThere={state}
      onRetryGettingThere={noop}
      onBack={noop}
      onShare={noop}
      onOpenDay={noop}
      onMoveMenu={noop}
      onRect={noop}
      onHold={noop}
      onDrag={noop}
      onDrop={noop}
    />
  );
}

export const GETTING_THERE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'all-days-getting-there': () => <GettingThereScene state={READY} />,
  'all-days-getting-there-loading': () => <GettingThereScene state={{ status: 'loading' }} />,
  'all-days-getting-there-none': () => (
    <GettingThereScene state={{ status: 'none', origin: HOME }} />
  ),
  'all-days-getting-there-failed': () => (
    <GettingThereScene state={{ status: 'failed', reason: 'error' }} />
  ),
};
