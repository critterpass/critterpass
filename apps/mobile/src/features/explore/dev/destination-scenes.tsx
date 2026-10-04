/**
 * Lab scenes for the destination guide (3d-1) and its guest-guide variant (3b-8): the page as
 * designed, a month priced for the crew, each price state, a saved page offline, a Vietnamese
 * crew's Đà Nẵng in đồng and a place only the guest guide covers. Month taps and the two actions
 * work; nothing is sent.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';

import type { ActionsMode } from '../components/destination-actions';
import { DestinationView } from '../components/destination-view';
import type { MonthPrices } from '../components/month-panel';
import type { PickCard } from '../components/picks-row';
import { WhySponsoredSheet } from '../components/why-sponsored-sheet';
import { crowdBand, legendChips, monthBars } from '../destination-model';
import { guideFor } from '../format';
import { guideTagline, heroChips, type HeroFacts } from '../guide-copy';
import type { CrewChoice } from '../queries';

import {
  type curve,
  DA_NANG_CURVE,
  DA_NANG_PICKS,
  KYOTO_CURVE,
  KYOTO_PICKS,
  NOW,
  pick,
  USD_ROWS,
  VND_ROWS,
} from './destination-scene-fixtures';

interface SceneSpec {
  readonly name: string;
  readonly guide: string | null;
  readonly learning?: boolean;
  readonly country?: string;
  readonly facts: HeroFacts;
  readonly curve: ReturnType<typeof curve> | null;
  readonly picks: readonly PickCard[];
  readonly month?: number | undefined;
  readonly prices?: MonthPrices;
  readonly saved?: boolean;
  readonly offline?: boolean;
  readonly loading?: boolean;
  readonly notice?: 'limited' | 'writing' | 'unavailable';
  readonly mode?: ActionsMode;
  readonly crews?: readonly CrewChoice[];
  /** Puts a sponsored card at this position in the picks. */
  readonly sponsoredAt?: number;
}

const KYOTO: SceneSpec = {
  name: 'Kyoto',
  guide: 'pon',
  facts: {
    flight: { origin: 'SIN', hours: 7, transfers: 0 },
    fx: {
      from: { amount_minor: 1000, currency: 'JPY' },
      to: { amount_minor: 670, currency: 'USD' },
    },
    best: [4, 11],
  },
  curve: KYOTO_CURVE,
  picks: KYOTO_PICKS,
  crews: [{ id: 'crew-bali', name: 'Bali Six' }],
};

const DA_NANG: SceneSpec = {
  name: 'Đà Nẵng',
  guide: 'chava',
  facts: {
    flight: { origin: 'SGN', hours: 1, transfers: 0 },
    fx: null,
    best: [2, 3, 4, 5],
  },
  curve: DA_NANG_CURVE,
  picks: DA_NANG_PICKS,
  month: 6,
  prices: { kind: 'rows', rows: VND_ROWS, offline: false },
  crews: [],
};

const SPECS: Readonly<Record<string, SceneSpec>> = {
  destination: KYOTO,
  'destination-month': {
    ...KYOTO,
    month: 4,
    prices: { kind: 'rows', rows: USD_ROWS, offline: false },
  },
  'destination-month-loading': { ...KYOTO, month: 4, prices: { kind: 'loading' } },
  'destination-no-airport': { ...KYOTO, month: 4, prices: { kind: 'noAirport' } },
  'destination-prices-unavailable': { ...KYOTO, month: 4, prices: { kind: 'unavailable' } },
  'destination-saved-offline': {
    ...KYOTO,
    saved: true,
    offline: true,
    month: 11,
    prices: { kind: 'rows', rows: USD_ROWS.slice(0, 2), offline: true },
  },
  'destination-loading': { ...KYOTO, curve: null, picks: [], loading: true },
  'destination-unavailable': {
    ...KYOTO,
    facts: { flight: null, fx: null, best: [4, 11] },
    curve: null,
    picks: [],
    offline: true,
    notice: 'unavailable',
  },
  'destination-da-nang': DA_NANG,
  'destination-writing': {
    ...KYOTO,
    facts: { ...KYOTO.facts, best: [] },
    curve: null,
    picks: [],
    notice: 'writing',
  },
  'destination-guest': {
    name: 'Marrakech',
    guide: null,
    country: 'Morocco',
    facts: {
      flight: { origin: 'SIN', hours: null, transfers: 1 },
      fx: {
        from: { amount_minor: 1000, currency: 'MAD' },
        to: { amount_minor: 100, currency: 'USD' },
      },
      best: [3, 10],
    },
    curve: null,
    picks: [],
    notice: 'limited',
    crews: [
      { id: 'crew-bali', name: 'Bali Six' },
      { id: 'crew-saigon', name: 'Hội bạn thân Sài Gòn' },
    ],
  },
  'destination-learning': {
    ...DA_NANG,
    name: 'Đà Lạt',
    guide: 'ngua',
    learning: true,
    curve: null,
    picks: [],
    month: undefined,
    notice: 'limited',
  },
  'destination-pick-crew': {
    ...KYOTO,
    mode: 'crews',
    crews: [
      { id: 'crew-bali', name: 'Bali Six' },
      { id: 'crew-saigon', name: 'Hội bạn thân Sài Gòn' },
    ],
  },
  'destination-no-crew': { ...KYOTO, mode: 'crews', crews: [] },
  'destination-solo': { ...DA_NANG, month: undefined, mode: 'solo' },
  // No month curve, so the picks (and the sponsored card) sit in the first screenful.
  'destination-sponsored': { ...KYOTO, curve: null, sponsoredAt: 2 },
};

function DestinationScene({ spec }: { readonly spec: SceneSpec }) {
  const { t, i18n } = useLingui();
  const [month, setMonth] = useState<number | null>(spec.month ?? null);
  const [mode, setMode] = useState<ActionsMode>(spec.mode ?? 'actions');
  const [saved, setSaved] = useState(spec.saved ?? false);
  const [why, setWhy] = useState(false);
  const guide = guideFor(spec.guide, spec.learning !== true);
  const bars = monthBars(spec.curve);
  const bar = month === null ? undefined : bars[month - 1];
  const crews = spec.crews ?? [];
  if (why) {
    return (
      <WhySponsoredSheet
        partner="Klook"
        place={spec.name}
        onPassPlus={() => setWhy(false)}
        onDismiss={() => setWhy(false)}
      />
    );
  }
  return (
    <DestinationView
      hero={{
        name: spec.name,
        guide,
        tagline: guideTagline(guide, spec.name),
        backLabel: spec.country ?? t({ id: 'explore.hero.back', message: 'Explore' }),
        onBack: () => undefined,
        saved,
        onToggleSave: () => setSaved((value) => !value),
        chips: heroChips(i18n.locale, spec.facts),
        photo: null,
      }}
      loading={spec.loading ?? false}
      offline={spec.offline ?? false}
      notice={spec.notice ?? null}
      months={
        bars.length === 0
          ? null
          : {
              bars,
              legend: legendChips(bars),
              selected: month,
              onSelect: (next) => setMonth((current) => (current === next ? null : next)),
              panel:
                month === null || bar === undefined
                  ? null
                  : {
                      month,
                      crowd: crowdBand(bar.fraction),
                      highlight: bar.highlight,
                      prices: spec.prices ?? { kind: 'rows', rows: USD_ROWS, offline: false },
                      onSetHomeAirport: () => undefined,
                      now: NOW,
                    },
            }
      }
      picks={
        spec.sponsoredAt === undefined
          ? spec.picks
          : [
              ...spec.picks.slice(0, spec.sponsoredAt),
              {
                ...pick('kyoto-sponsored', 'Tea ceremony in Gion', 'other'),
                sponsored: { onWhy: () => setWhy(true) },
              },
              ...spec.picks.slice(spec.sponsoredAt),
            ]
      }
      onOpenPick={() => undefined}
      onMap={() => undefined}
      actions={{
        mode,
        placeName: spec.name,
        guideName: guide.name,
        crews,
        soloBusy: false,
        onPitch: () => setMode(crews.length === 1 ? 'actions' : 'crews'),
        onPickCrew: () => setMode('actions'),
        onSolo: () => setMode('solo'),
        onConfirmSolo: () => setMode('actions'),
        onCancel: () => setMode('actions'),
      }}
    />
  );
}

export const DESTINATION_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...Object.fromEntries(
    Object.entries(SPECS).map(([name, spec]) => [name, () => <DestinationScene spec={spec} />]),
  ),
  'destination-sponsored-why': () => (
    <WhySponsoredSheet partner="Klook" place="Kyoto" onPassPlus={() => undefined} />
  ),
};
