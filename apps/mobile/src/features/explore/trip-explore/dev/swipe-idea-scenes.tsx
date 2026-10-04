/**
 * Lab scenes for swipe together sending matches to Ideas (7g-2): the deck with MATCH stamped on
 * Tirta Empul and the faces of everyone who said yes, the finished deck listing its matches as
 * Ideas with "See them in Ideas", and a Vietnamese crew's match with long names. The stamp holds in
 * the scene (a real match drops away to Ideas on its own); swipes work over the fixtures.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { DeckReason } from '@cp/domain';
import { useState, type ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { SwipeView, type SwipeStage } from '../../components/swipe-view';
import { guideFor } from '../../format';
import { socialPill, swipeMeta } from '../../swipe-copy';
import { whyLines } from '../../swipe-model';

interface Card {
  readonly poiId: string;
  readonly name: string;
  readonly category: string;
  readonly reasons: readonly DeckReason[];
  readonly note: string | null;
  readonly yes: readonly string[];
}

interface Spec {
  readonly eyebrow: string;
  readonly guide: string;
  readonly crew: readonly string[];
  readonly cards: readonly Card[];
  readonly match: { readonly place: string; readonly voters: readonly string[] } | null;
  readonly summary: boolean;
}

const BALI_CARDS: readonly Card[] = [
  {
    poiId: 'tirta-empul',
    name: 'Tirta Empul',
    category: 'temple_shrine',
    reasons: [{ code: 'must_see' }, { code: 'crew_saved', value: 2 }],
    note: "Sarongs needed. I'll bring a spare for Jordan.",
    yes: ['Alex', 'Rin'],
  },
  {
    poiId: 'tegallalang',
    name: 'Tegallalang Rice Terrace',
    category: 'nature',
    reasons: [{ code: 'near_stay', value: 1400 }],
    note: null,
    yes: [],
  },
];

const DA_NANG_CARDS: readonly Card[] = [
  {
    poiId: 'marble',
    name: 'Ngũ Hành Sơn và làng đá mỹ nghệ Non Nước',
    category: 'nature',
    reasons: [{ code: 'must_see' }],
    note: 'Đi thang máy lên, đi bộ xuống. Mang nước theo nhé.',
    yes: ['Nguyễn Thị Thanh Hương', 'Khánh'],
  },
];

const BALI: Spec = {
  eyebrow: 'Bali · Oct 12 – 19',
  guide: 'tokek',
  crew: ['Maya', 'Alex', 'Jordan', 'Rin'],
  cards: BALI_CARDS,
  match: { place: 'Tirta Empul', voters: ['Maya', 'Alex', 'Rin'] },
  summary: false,
};

const SPECS: Readonly<Record<string, Spec>> = {
  'swipe-idea-match': BALI,
  'swipe-idea-summary': { ...BALI, match: null, summary: true },
  'swipe-idea-match-da-nang': {
    eyebrow: 'Đà Nẵng · 2 – 4 thg 10',
    guide: 'chava',
    crew: ['Nguyễn Thị Thanh Hương', 'Khánh', 'Minh'],
    cards: DA_NANG_CARDS,
    match: {
      place: 'Ngũ Hành Sơn và làng đá mỹ nghệ Non Nước',
      voters: ['Nguyễn Thị Thanh Hương', 'Khánh', 'Minh'],
    },
    summary: false,
  },
};

/** A match that holds for the shot instead of dropping away. */
const LAB_HOLD_MS = 600_000;

function SwipeIdeaScene({ spec }: { readonly spec: Spec }) {
  useLocale();
  const [at, setAt] = useState(0);
  const [whyOpen, setWhyOpen] = useState(false);
  const [match, setMatch] = useState(spec.match);
  const members = spec.crew.map((name, index) => ({ key: name, name, joinIndex: index }));
  const card = spec.cards[at];
  const stage: SwipeStage =
    spec.summary || card === undefined
      ? {
          kind: 'summary',
          ended: false,
          yesCount: 9,
          matches: [
            {
              id: 'one',
              name: 'Tirta Empul',
              dayNo: null,
              outcome: { kind: 'idea' },
              voters: 'Maya + Alex + Rin',
            },
            {
              id: 'two',
              name: 'Campuhan Ridge Walk',
              dayNo: null,
              outcome: { kind: 'idea' },
              voters: 'Jordan + Rin',
            },
          ],
          onIdeas: () => undefined,
        }
      : {
          kind: 'deck',
          top: {
            poiId: card.poiId,
            name: card.name,
            category: card.category,
            meta: swipeMeta(card.category, null, card.reasons),
            note: card.note,
            social: socialPill(card.yes),
            photo: null,
          },
          under: null,
          why: whyLines(card.reasons),
        };
  return (
    <SwipeView
      eyebrow={spec.eyebrow}
      guide={guideFor(spec.guide)}
      live={members}
      done={12 + at}
      total={30}
      matchCount={3}
      offline={false}
      stage={stage}
      whyOpen={whyOpen}
      onWhy={setWhyOpen}
      onSwipe={() => setAt((current) => current + 1)}
      match={
        match === null
          ? null
          : {
              placeName: match.place,
              dayNo: null,
              outcome: { kind: 'idea' },
              voters: members.filter((member) => match.voters.includes(member.name)),
              holdMs: LAB_HOLD_MS,
              onDone: () => setMatch(null),
            }
      }
      onBack={() => undefined}
    />
  );
}

export const SWIPE_IDEA_SCENES: Readonly<Record<string, () => ReactNode>> = Object.fromEntries(
  Object.entries(SPECS).map(([name, spec]) => [name, () => <SwipeIdeaScene spec={spec} />]),
);
