/**
 * Lab scenes for the place page (3d-3): as designed inside a trip, a member's suggestion, already
 * in the plan, with no trip, closed on the day, with no crowd data, offline, a long Vietnamese
 * name, and a Đà Nẵng place with no photo of its own filled in by Foursquare's live facts. Save and
 * the main action work; nothing is sent.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import type { CrowdChartProps } from '../components/crowd-chart';
import { PlaceView } from '../components/place-view';
import { guideFor } from '../format';
import { placeMeta, placeTags, type PlaceMetaFacts } from '../place-copy';
import { liveFacts, type PlaceLive } from '../place-live';
import { crowdColumns, goAdvice, type AddState } from '../place-model';

const HOURLY = [
  5, 4, 3, 3, 4, 8, 14, 22, 44, 66, 82, 86, 80, 76, 72, 68, 60, 42, 30, 20, 14, 10, 8, 6,
];
const DATE = '2027-04-03';
const CHART: CrowdChartProps = {
  kind: 'chart',
  date: DATE,
  columns: crowdColumns(HOURLY),
  advice: goAdvice({ start: '06:00', end: '07:30' }),
  markedHour: 6,
  quietHours: [6, 7],
};
const CREW = [
  { key: 'm', name: 'Maya', joinIndex: 0 },
  { key: 'j', name: 'Jordan', joinIndex: 1 },
  { key: 'r', name: 'Rin', joinIndex: 3 },
];

interface SceneSpec {
  readonly name: string;
  readonly guide: string | null;
  readonly category: string;
  readonly guidePick?: boolean;
  readonly mustDoOwner?: string | undefined;
  readonly meta: Omit<PlaceMetaFacts, 'category'>;
  readonly crowd: CrowdChartProps;
  readonly tip: string | null;
  readonly keen?: number;
  readonly qna?: string | undefined;
  /** Null: opened outside a trip. */
  readonly add: AddState | null;
  readonly proposedOnAdd?: boolean;
  readonly offline?: boolean;
  readonly saved?: boolean;
  readonly offers?: boolean;
  /** Foursquare's live answer for the place. */
  readonly live?: PlaceLive;
}

// A staging stock photo of a Đà Nẵng beach: Wikimedia refuses Android's image loader.
const STOCK = 'https://media.staging.critterpass.app/c/media/01a0f4a2-e2d1-7495-adc0-1b6fc321be89';
const LIVE_PHOTOS = [1242, 828, 480].map((w) => ({
  url: `${STOCK}/${String(w)}.webp`,
  width: 5881,
  height: 3975,
}));

const MY_KHE_LIVE: PlaceLive = {
  available: true,
  openNow: true,
  closedPermanently: false,
  hours: null,
  priceLevel: 2,
  rating: 8.6,
  photos: LIVE_PHOTOS,
  tips: [
    { text: 'Go at sunrise: the sand is cool and the fishing boats are coming in.', createdAt: '' },
    { text: 'Loungers are 50k for the day, and the showers behind them are free.', createdAt: '' },
  ],
  website: 'https://danangfantasticity.com',
  phone: '+84 236 3550 111',
  attribution: { name: 'Foursquare', url: 'https://foursquare.com' },
};

const FUSHIMI: SceneSpec = {
  name: 'Fushimi Inari',
  guide: 'pon',
  category: 'temple_shrine',
  guidePick: true,
  mustDoOwner: 'Rin',
  meta: { priceLevel: 0, open: 'always', stayMinutes: 18 },
  crowd: CHART,
  tip: 'Keep going past the Yotsutsuji viewpoint. Most people turn back there.',
  keen: 3,
  qna: 'Jordan asked about stairs. The first 30 minutes are gentle; it gets steep after.',
  add: { kind: 'add', dayNo: 2, time: '06:00', mode: 'apply' },
  saved: true,
  offers: true,
};

const SPECS: Readonly<Record<string, SceneSpec>> = {
  place: FUSHIMI,
  'place-member': {
    ...FUSHIMI,
    qna: undefined,
    keen: 2,
    add: { kind: 'add', dayNo: 2, time: '06:00', mode: 'changeset' },
    proposedOnAdd: true,
    saved: false,
  },
  'place-in-plan': { ...FUSHIMI, add: { kind: 'planned', dayNo: 2 } },
  'place-plan-full': { ...FUSHIMI, keen: 0, qna: undefined, add: { kind: 'full' } },
  'place-no-trip': {
    ...FUSHIMI,
    mustDoOwner: undefined,
    meta: { priceLevel: 0, open: 'always', stayMinutes: null },
    keen: 0,
    qna: undefined,
    add: null,
    saved: false,
  },
  'place-closed': {
    ...FUSHIMI,
    name: 'Nishiki Market',
    category: 'market',
    mustDoOwner: undefined,
    meta: { priceLevel: null, open: 'closed', stayMinutes: 9 },
    crowd: { kind: 'closed', date: DATE },
    tip: 'Come hungry and come before noon. The tamagoyaki stall sells out.',
    keen: 1,
    qna: undefined,
    // The button never offers a closed day: with no open day free in the plan it offers none.
    add: { kind: 'full' },
  },
  'place-no-crowd': {
    ...FUSHIMI,
    name: 'Arashiyama',
    category: 'nature',
    guidePick: false,
    mustDoOwner: undefined,
    meta: { priceLevel: null, open: 'unknown', stayMinutes: 41 },
    crowd: { kind: 'none', date: DATE },
    tip: null,
    keen: 0,
    qna: undefined,
    offers: false,
  },
  'place-offline': {
    ...FUSHIMI,
    meta: { priceLevel: 0, open: 'always', stayMinutes: null },
    keen: 0,
    qna: undefined,
    add: { kind: 'none' },
    offline: true,
  },
  'place-da-nang': {
    name: 'Ngũ Hành Sơn (Marble Mountains) và làng đá mỹ nghệ Non Nước',
    guide: 'chava',
    category: 'nature',
    guidePick: true,
    mustDoOwner: 'Nguyễn Thị Thanh Hương',
    meta: { priceLevel: null, open: 'open', stayMinutes: 25 },
    crowd: {
      ...CHART,
      advice: goAdvice({ start: '15:00', end: '17:00' }),
      markedHour: 15,
      quietHours: [15, 16],
    },
    tip: 'Đi thang máy lên, đi bộ xuống. Động Huyền Không đẹp nhất lúc gần trưa, khi nắng rọi qua giếng trời.',
    keen: 2,
    add: { kind: 'add', dayNo: 3, time: '15:00', mode: 'changeset' },
    proposedOnAdd: true,
    offers: true,
  },
  'place-foursquare': {
    name: 'Phạm Văn Đồng Beach',
    guide: 'chava',
    category: 'beach',
    guidePick: true,
    meta: { priceLevel: null, open: 'unknown', stayMinutes: 12 },
    crowd: { kind: 'none', date: DATE },
    tip: null,
    add: null,
    live: MY_KHE_LIVE,
  },
};

function PlaceScene({ spec }: { readonly spec: SceneSpec }) {
  // Re-renders the scene's catalogue copy when the lab switches language.
  useLocale();
  const [saved, setSaved] = useState(spec.saved ?? false);
  const [added, setAdded] = useState<number | null>(null);
  const guide = guideFor(spec.guide);
  const live = liveFacts(spec.live, {
    hours: null,
    priceLevel: spec.meta.priceLevel,
    hasPhoto: false,
  });
  const state: AddState | null =
    spec.add === null ? null : added === null ? spec.add : { kind: 'planned', dayNo: added };
  return (
    <PlaceView
      name={spec.name}
      category={spec.category}
      guide={guide}
      photo={null}
      heroUrl={live.heroUrl}
      live={live.details}
      tags={placeTags({
        guideName: guide.name,
        guidePick: spec.guidePick ?? false,
        mustDoOwner: spec.mustDoOwner ?? null,
      })}
      meta={placeMeta({
        category: spec.category,
        ...spec.meta,
        priceLevel: live.priceLevel,
        open: live.openNow === null ? spec.meta.open : live.openNow ? 'open' : 'closed',
      })}
      offline={spec.offline ?? false}
      saved={saved}
      onBack={() => undefined}
      onShare={() => undefined}
      onToggleSave={() => setSaved((value) => !value)}
      crowd={spec.crowd}
      tip={spec.tip}
      crew={
        spec.add === null ? null : { keen: CREW.slice(0, spec.keen ?? 0), qna: spec.qna ?? null }
      }
      offers={
        spec.offers === true
          ? { placeName: spec.name, offline: spec.offline ?? false, onOpen: () => undefined }
          : null
      }
      action={
        state === null
          ? { kind: 'save', saved, onToggleSave: () => setSaved((value) => !value) }
          : {
              kind: 'trip',
              state,
              proposed: added !== null && (spec.proposedOnAdd ?? false),
              busy: false,
              offline: spec.offline ?? false,
              onAdd: () => setAdded(state.kind === 'add' ? state.dayNo : null),
              onOpenPlan: () => undefined,
            }
      }
      onMap={() => undefined}
      onChat={() => undefined}
    />
  );
}

export const PLACE_SCENES: Readonly<Record<string, () => ReactNode>> = Object.fromEntries(
  Object.entries(SPECS).map(([name, spec]) => [name, () => <PlaceScene spec={spec} />]),
);
