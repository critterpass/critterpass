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
import { crowdBand, legendChips, monthBars, type PriceRow } from '../destination-model';
import { guideFor } from '../format';
import { guideTagline, heroChips, type HeroFacts } from '../guide-copy';
import type { CrewChoice } from '../queries';

const NOW = new Date('2026-10-01T09:00:00Z');
const SEEN = '2026-10-01T06:00:00Z';

const curve = (crowds: readonly number[], roles: Readonly<Record<number, [string, string?]>>) =>
  crowds.map((crowd_index, index) => ({
    month: index + 1,
    crowd_index,
    colour_role: roles[index + 1]?.[0] ?? 'normal',
    highlight_tag: roles[index + 1]?.[1] ?? null,
  }));

const KYOTO_CURVE = curve([28, 30, 52, 88, 62, 42, 50, 54, 44, 58, 86, 36], {
  1: ['cheapest'],
  2: ['cheapest'],
  4: ['peak', 'blossoms'],
  11: ['peak', 'leaves'],
});
const DA_NANG_CURVE = curve([40, 62, 58, 70, 82, 95, 100, 88, 46, 30, 26, 38], {
  6: ['peak', 'fireworks festival'],
  10: ['cheapest'],
  11: ['cheapest'],
});

const pick = (id: string, name: string, category: string): PickCard => ({
  id,
  name,
  category,
  photo: null,
});
const KYOTO_PICKS = [
  pick('kyoto-1', 'Fushimi Inari', 'temple_shrine'),
  pick('kyoto-2', 'Nishiki Market', 'market'),
  pick('kyoto-3', 'Arashiyama', 'nature'),
  pick('kyoto-4', 'Kiyomizu-dera', 'temple_shrine'),
];
const DA_NANG_PICKS = [
  pick('da-nang-1', 'Bán đảo Sơn Trà', 'nature'),
  pick('da-nang-2', 'Ngũ Hành Sơn (Marble Mountains)', 'nature'),
  pick('da-nang-3', 'Chợ Cồn', 'market'),
  pick('da-nang-4', 'Bãi biển Mỹ Khê', 'beach'),
];

const row = (over: Partial<PriceRow> & Pick<PriceRow, 'origin'>): PriceRow => ({
  mine: false,
  names: [],
  others: 0,
  price: null,
  seenAt: SEEN,
  ...over,
});
const USD_ROWS: readonly PriceRow[] = [
  row({ origin: 'SIN', mine: true, names: ['Jordan'], price: { minor: 41_200, currency: 'USD' } }),
  row({ origin: 'KUL', names: ['Rin', 'Alex'], price: { minor: 36_800, currency: 'USD' } }),
  row({ origin: 'MNL', names: [], others: 2, seenAt: null }),
];
const VND_ROWS: readonly PriceRow[] = [
  row({
    origin: 'SGN',
    mine: true,
    names: ['Nguyễn Thị Thanh Hương'],
    price: { minor: 12_500_000, currency: 'VND' },
  }),
  row({ origin: 'HAN', names: ['Khánh'], price: { minor: 2_350_000, currency: 'VND' } }),
];

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
