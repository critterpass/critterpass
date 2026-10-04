/**
 * Lab scenes for Swipe together (3d-2): the deck as designed with others' yes votes and the
 * guide's note, WHY THIS? open, the match stamp, a solo traveller, the deck being built, the
 * finished summary, an ended session, offline, Đà Nẵng with long names, and Đà Nẵng cards with a
 * place's own photo, a labelled generic one and none (the doodle). Swipes, the buttons and undo
 * work over the fixtures; nothing is sent.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { DeckReason, PlaceMediaAsset } from '@cp/domain';
import { useState, type ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { SwipeView, type SwipeStage } from '../components/swipe-view';
import { guideFor } from '../format';
import { socialPill, swipeMeta } from '../swipe-copy';
import { whyLines } from '../swipe-model';
import { BEACH_GENERIC, MY_KHE_OWN } from './lab-place-media';

interface Fixture {
  readonly poiId: string;
  readonly name: string;
  readonly category: string;
  readonly reasons: readonly DeckReason[];
  readonly note: string | null;
  readonly yes: readonly string[];
  readonly photo?: PlaceMediaAsset;
}

const BALI: readonly Fixture[] = [
  {
    poiId: 'tirta-empul',
    name: 'Tirta Empul',
    category: 'temple_shrine',
    reasons: [
      { code: 'must_see' },
      { code: 'taste', value: 'temples' },
      { code: 'crew_saved', value: 2 },
    ],
    note: "Sarongs needed. I'll bring a spare for Jordan.",
    yes: ['Alex', 'Rin'],
  },
  {
    poiId: 'tegalalang',
    name: 'Tegalalang Rice Terrace',
    category: 'nature',
    reasons: [{ code: 'near_stay', value: 1400 }],
    note: null,
    yes: [],
  },
  {
    poiId: 'ubud-market',
    name: 'Ubud Art Market',
    category: 'market',
    reasons: [],
    note: null,
    yes: ['Maya'],
  },
];
const DA_NANG: readonly Fixture[] = [
  {
    poiId: 'marble',
    name: 'Ngũ Hành Sơn (Marble Mountains) và làng đá mỹ nghệ Non Nước',
    category: 'nature',
    reasons: [{ code: 'must_see' }, { code: 'near_stay', value: 900 }],
    note: 'Đi thang máy lên, đi bộ xuống. Mang nước theo nhé.',
    yes: ['Nguyễn Thị Thanh Hương', 'Khánh', 'Minh'],
  },
  { poiId: 'my-khe', name: 'Bãi biển Mỹ Khê', category: 'beach', reasons: [], note: null, yes: [] },
];
const DA_NANG_PHOTOS: readonly Fixture[] = [
  {
    poiId: 'my-khe',
    name: 'My Khe Beach',
    category: 'beach',
    reasons: [{ code: 'near_stay', value: 700 }],
    note: 'Sunrise swim, then bánh mì.',
    yes: ['Minh'],
    photo: MY_KHE_OWN,
  },
  {
    poiId: 'pham-van-dong',
    name: 'Bãi Biển Phạm Văn Đồng',
    category: 'beach',
    reasons: [],
    note: null,
    yes: [],
    photo: BEACH_GENERIC,
  },
  {
    poiId: 'chua-my-khe',
    name: 'Chùa Mỹ Khê',
    category: 'temple_shrine',
    reasons: [],
    note: null,
    yes: [],
  },
];
const CREW = [
  { key: 'm', name: 'Maya', joinIndex: 0 },
  { key: 'a', name: 'Alex', joinIndex: 4 },
  { key: 'j', name: 'Jordan', joinIndex: 1 },
  { key: 'w', name: 'Wei', joinIndex: 2 },
];

interface SwipeSpec {
  readonly eyebrow: string;
  readonly guide: string;
  readonly cards: readonly Fixture[];
  readonly live?: number;
  readonly done?: number;
  readonly total?: number;
  readonly matchCount?: number;
  readonly whyOpen?: boolean;
  readonly match?: boolean;
  readonly offline?: boolean;
  readonly stage?: 'building' | 'summary' | 'ended';
}

const PHOTOS: SwipeSpec = {
  eyebrow: 'Đà Nẵng · Oct 2 – 4',
  guide: 'chava',
  cards: DA_NANG_PHOTOS,
  live: 3,
  done: 6,
  total: 30,
  matchCount: 1,
};

const BASE: SwipeSpec = {
  eyebrow: 'Bali · Oct 12 – 19',
  guide: 'tokek',
  cards: BALI,
  live: 4,
  done: 12,
  total: 30,
  matchCount: 3,
};

const SPECS: Readonly<Record<string, SwipeSpec>> = {
  swipe: BASE,
  'swipe-why': { ...BASE, whyOpen: true },
  'swipe-match': { ...BASE, match: true },
  'swipe-solo': { ...BASE, live: 0, matchCount: 1, cards: BALI.slice(1) },
  'swipe-building': { ...BASE, done: 0, total: 0, matchCount: 0, stage: 'building' },
  'swipe-summary': { ...BASE, done: 30, stage: 'summary' },
  'swipe-ended': { ...BASE, stage: 'ended' },
  'swipe-offline': { ...BASE, live: 0, offline: true },
  'swipe-da-nang': {
    eyebrow: 'Đà Nẵng · 2 – 4 thg 10',
    guide: 'chava',
    cards: DA_NANG,
    live: 3,
    done: 4,
    total: 28,
    matchCount: 1,
  },
  'swipe-photo': PHOTOS,
  'swipe-photo-generic': { ...PHOTOS, cards: DA_NANG_PHOTOS.slice(1), done: 7 },
};

function SwipeScene({ spec }: { readonly spec: SwipeSpec }) {
  useLocale();
  const [at, setAt] = useState(0);
  const [whyOpen, setWhyOpen] = useState(spec.whyOpen ?? false);
  const [match, setMatch] = useState(spec.match ?? false);
  const face = (index: number) => {
    const card = spec.cards[index];
    return card === undefined
      ? null
      : {
          poiId: card.poiId,
          name: card.name,
          category: card.category,
          meta: swipeMeta(card.category, null, card.reasons),
          note: card.note,
          social: socialPill(card.yes),
          photo: card.photo ?? null,
        };
  };
  const top = face(at);
  const summary: SwipeStage = {
    kind: 'summary',
    ended: spec.stage === 'ended',
    yesCount: 9,
    matches:
      spec.stage === 'ended'
        ? []
        : [
            { id: 'one', name: 'Tirta Empul', dayNo: 3 },
            { id: 'two', name: 'Tegalalang Rice Terrace', dayNo: null },
          ],
  };
  const stage: SwipeStage =
    spec.stage === 'building'
      ? { kind: 'building' }
      : spec.stage !== undefined || top === null
        ? summary
        : { kind: 'deck', top, under: face(at + 1), why: whyLines(spec.cards[at]?.reasons ?? []) };
  return (
    <SwipeView
      eyebrow={spec.eyebrow}
      guide={guideFor(spec.guide)}
      live={CREW.slice(0, spec.live ?? 0)}
      done={(spec.done ?? 0) + at}
      total={spec.total ?? 0}
      matchCount={spec.matchCount ?? 0}
      offline={spec.offline ?? false}
      stage={stage}
      whyOpen={whyOpen}
      onWhy={setWhyOpen}
      onSwipe={() => setAt((current) => current + 1)}
      onUndo={at === 0 ? undefined : () => setAt((current) => current - 1)}
      match={match ? { placeName: 'Tirta Empul', dayNo: 3, onDone: () => setMatch(false) } : null}
      onBack={() => undefined}
    />
  );
}

export const SWIPE_SCENES: Readonly<Record<string, () => ReactNode>> = Object.fromEntries(
  Object.entries(SPECS).map(([name, spec]) => [name, () => <SwipeScene spec={spec} />]),
);
