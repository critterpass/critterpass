/**
 * Fixed budget scenes (developer tools and device screenshots): the organiser's sweet spot as the
 * render shows it (3c-5, six maxes in, $1,350 each) and every state around it, plus the member's
 * write-only form. Prices are chosen so the cost engine splits $1,350 into the render's bars.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture data, never copy. */
import { fxContextOf, type BudgetEstimateSource } from '@cp/cost-engine';
import { i18n } from '@lingui/core';

import { DEV, JORDAN, kyotoTrip, MAYA, sceneFrame } from '../scenes/fixtures';
import type { SetupScene } from '../scenes/types';
import { BudgetView, type LockState } from './budget-view';
import { datesLabel } from './labels';
import { estimatesOf, type BandView, type Track } from './model';
import { PrivateMaxView, type PrivateMaxModel } from './private-max-view';

const SOURCE: BudgetEstimateSource = {
  currency: 'USD',
  start_date: '2027-04-02',
  end_date: '2027-04-09',
  members: [
    { uid: JORDAN, home: 'SFO' },
    { uid: MAYA, home: 'SFO' },
  ],
  fares: [{ origin: 'SFO', price_minor: 52_000, currency: 'USD', days: [] }],
  indices: [
    {
      stay_type: 'apartment',
      nightly_low_minor: 3_500,
      nightly_high_minor: 6_000,
      food_pp_day_minor: 2_750,
      fun_pp_day_minor: 1_750,
      currency: 'USD',
    },
    {
      stay_type: 'ryokan',
      nightly_low_minor: 7_000,
      nightly_high_minor: 8_500,
      food_pp_day_minor: 2_750,
      fun_pp_day_minor: 1_750,
      currency: 'USD',
    },
  ],
  fx: [
    {
      id: 'fx-1',
      base: 'USD',
      quote: 'VND',
      rate: '25400',
      as_of: '2026-10-01',
      source: 'ecb',
    },
  ],
};

const ESTIMATES = estimatesOf(SOURCE);
const TRACK: Track = { minMinor: 80_000, maxMinor: 250_000, stepMinor: 5_000 };
const DOTS = [0.58, 0.62, 0.64, 0.7, 0.76, 0.86];
const BAND: BandView = {
  kind: 'band',
  set: 6,
  of: 6,
  lowMinor: 80_000,
  highMinor: 140_000,
  trackHighMinor: 250_000,
  dots: DOTS,
  underAll: true,
};

function organiser(
  options: {
    readonly band?: BandView;
    readonly target?: number;
    readonly loading?: boolean;
    readonly priced?: boolean;
    readonly lock?: LockState;
    readonly offline?: boolean;
  } = {},
) {
  const trip = kyotoTrip({ step: 'budget', dates: true });
  return (
    <BudgetView
      shell={sceneFrame(trip, 'budget', { offline: options.offline === true })}
      trip={trip}
      dates={datesLabel(i18n.locale, '2027-04-02', '2027-04-09')}
      band={options.band ?? BAND}
      track={TRACK}
      currency="USD"
      estimates={options.priced === false ? null : ESTIMATES}
      estimatesLoading={options.loading === true}
      initialTarget={options.target ?? 135_000}
      lock={options.lock ?? { kind: 'idle' }}
      onLock={() => undefined}
      onSkip={null}
      onCheaperDates={() => undefined}
    />
  );
}

function member(model: Partial<PrivateMaxModel>, me: string = DEV) {
  const trip = kyotoTrip({ step: 'budget', dates: true, me });
  return (
    <PrivateMaxView
      shell={sceneFrame(trip, 'budget')}
      dates={datesLabel(i18n.locale, '2027-04-02', '2027-04-09')}
      model={{
        state: 'entry',
        queued: false,
        fit: null,
        entryCurrency: 'USD',
        tripCurrency: 'USD',
        fx: fxContextOf(SOURCE),
        prefill: 1500,
        counts: { set: 4, of: 6 },
        ...model,
      }}
      onSave={() => undefined}
      onChange={() => undefined}
    />
  );
}

export const BUDGET_SCENES: readonly SetupScene[] = [
  { name: '3c-5-budget', render: () => organiser() },
  {
    name: 'budget-waiting',
    render: () => organiser({ band: { kind: 'waiting', set: 2, of: 6 }, target: 130_000 }),
  },
  { name: 'budget-knob-over', render: () => organiser({ target: 160_000 }) },
  {
    name: 'budget-infeasible',
    render: () =>
      organiser({
        band: { kind: 'infeasible', set: 5, of: 6, trackHighMinor: 250_000, dots: DOTS },
        target: 110_000,
      }),
  },
  { name: 'budget-estimates-loading', render: () => organiser({ loading: true }) },
  { name: 'budget-estimates-failed', render: () => organiser({ priced: false }) },
  {
    name: 'budget-offline',
    render: () => organiser({ offline: true, lock: { kind: 'offline' } }),
  },
  { name: 'budget-member-entry', render: () => member({}) },
  {
    name: 'budget-multi-currency',
    render: () => member({ entryCurrency: 'VND', prefill: 35_000_000 }),
  },
  {
    name: 'budget-member-set',
    render: () => member({ state: 'set', fit: 'fits', counts: { set: 5, of: 6 } }),
  },
];
