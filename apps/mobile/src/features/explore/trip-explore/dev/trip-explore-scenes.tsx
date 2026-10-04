/**
 * Lab scenes for Explore in a trip (7g-1): Bali as designed (the Wednesday window with three ideas,
 * a saved pick, one in day 3 and one to add, four swiping), the days full, nothing planned yet, the
 * window offline (no ideas), and Đà Nẵng with long Vietnamese names. The + saves in the scene (the
 * card flips to ♥ SAVED); nothing is sent.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { guideFor } from '../../format';
import { guideTagline } from '../../guide-copy';
import * as copy from '../copy';
import type { GapsCardState } from '../gaps-card';
import type { PickState, SwipeLive } from '../trip-explore-model';
import { TripExploreView, type TripPick } from '../trip-explore-view';
import { SWIPE_IDEA_SCENES } from './swipe-idea-scenes';

interface PickFixture {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly state: PickState;
}

interface Spec {
  readonly place: string;
  readonly guide: string;
  readonly saved: number;
  readonly gaps: 'gap' | 'offline' | 'full' | 'empty';
  readonly gap: {
    readonly date: string;
    readonly from: string;
    readonly to: string;
    readonly who: number;
    readonly busy: string | null;
  };
  readonly ideas: readonly string[];
  readonly picks: readonly PickFixture[];
  readonly places: string;
  readonly live: SwipeLive;
}

const BALI: Spec = {
  place: 'Bali',
  guide: 'tokek',
  saved: 14,
  gaps: 'gap',
  // 14 Oct 2026 is a Wednesday.
  gap: { date: '2026-10-14', from: '16:00', to: '19:00', who: 4, busy: 'Karsa Spa' },
  ideas: ['Seniman', 'ARMA', 'Pool'],
  picks: [
    { id: 'tirta-empul', name: 'Tirta Empul', category: 'temple_shrine', state: { kind: 'saved' } },
    {
      id: 'campuhan',
      name: 'Campuhan Ridge',
      category: 'nature',
      state: { kind: 'inDay', dayNo: 3 },
    },
    { id: 'tegallalang', name: 'Tegallalang', category: 'nature', state: { kind: 'add' } },
  ],
  places: '86',
  live: { kind: 'live', count: 4 },
};

const DA_NANG: Spec = {
  place: 'Đà Nẵng',
  guide: 'chava',
  saved: 9,
  gaps: 'gap',
  gap: {
    date: '2026-10-03',
    from: '14:00',
    to: '17:30',
    who: 3,
    busy: 'Bảo tàng Điêu khắc Chăm',
  },
  ideas: ['Chợ Hàn', 'Bán đảo Sơn Trà + Chùa Linh Ứng', 'Bãi biển Mỹ Khê'],
  picks: [
    {
      id: 'ngu-hanh-son',
      name: 'Danh thắng Ngũ Hành Sơn',
      category: 'nature',
      state: { kind: 'add' },
    },
    { id: 'cho-han', name: 'Chợ Hàn', category: 'market', state: { kind: 'saved' } },
    {
      id: 'cau-rong',
      name: 'Cầu Rồng phun lửa cuối tuần',
      category: 'museum',
      state: { kind: 'inDay', dayNo: 2 },
    },
  ],
  places: '1.240',
  live: { kind: 'join' },
};

const SPECS: Readonly<Record<string, Spec>> = {
  'trip-explore': BALI,
  'trip-explore-full': { ...BALI, gaps: 'full', live: { kind: 'start' } },
  'trip-explore-empty': {
    ...BALI,
    gaps: 'empty',
    saved: 0,
    picks: BALI.picks.map((pick) => ({ ...pick, state: { kind: 'add' } })),
    live: { kind: 'start' },
  },
  'trip-explore-offline': { ...BALI, gaps: 'offline' },
  'trip-explore-da-nang': DA_NANG,
};

function TripExploreScene({ spec }: { readonly spec: Spec }) {
  useLocale();
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const guide = guideFor(spec.guide);
  const gaps: GapsCardState =
    spec.gaps === 'full' || spec.gaps === 'empty'
      ? { kind: spec.gaps }
      : {
          kind: 'gap',
          when: copy.gapWhen(spec.gap.date, spec.gap.from, spec.gap.to),
          who: copy.gapWho(spec.gap.who, false, spec.gap.busy),
          tiles:
            spec.gaps === 'offline'
              ? []
              : spec.ideas.map((label) => ({ key: label, label, onPress: () => undefined })),
          onFill: () => undefined,
        };
  const picks: TripPick[] = spec.picks.map((pick) => ({
    id: pick.id,
    name: pick.name,
    category: pick.category,
    photo: null,
    state: saved.has(pick.id) ? { kind: 'saved' } : pick.state,
  }));
  return (
    <TripExploreView
      hero={{
        name: spec.place,
        guide,
        tagline: guideTagline(guide, spec.place),
        backLabel: copy.backLabel(),
        onBack: () => undefined,
        photo: null,
      }}
      savedCount={spec.saved + saved.size}
      onSaved={() => undefined}
      searchPlaceholder={copy.searchPlaceholder(spec.place, guide.name)}
      onSearch={() => undefined}
      offline={spec.gaps === 'offline'}
      gaps={gaps}
      picks={picks}
      placesCount={spec.places}
      onAllPlaces={() => undefined}
      onOpenPick={() => undefined}
      onSavePick={(pick) => setSaved((current) => new Set(current).add(pick.id))}
      swipe={{ deckSize: 30, live: spec.live, onPress: () => undefined }}
    />
  );
}

export const TRIP_EXPLORE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...Object.fromEntries(
    Object.entries(SPECS).map(([name, spec]) => [name, () => <TripExploreScene spec={spec} />]),
  ),
  ...SWIPE_IDEA_SCENES,
};
