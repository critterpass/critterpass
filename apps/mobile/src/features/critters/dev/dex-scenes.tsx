/**
 * Lab scenes for the PASS tab (3l-2), a set (3l-8) and the hatch (3l-1), over the real catalogue
 * with fixed finds, including a fresh account's states (no finds, no crew counts, no trip, long
 * names). Handlers are no-ops except the filters and search, which work.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import { buildDex, type DexFilter, type DexInput } from '../dex/dex-model';
import { DexView } from '../dex/dex-view';
import { SetView } from '../dex/set-view';
import type { EggCard } from '../hatch/hatch-model';
import { HatchView, type HatchViewProps } from '../hatch/hatch-view';
import { labDexInput, labTrip } from './dex-fixtures';

const noop = () => undefined;

const FRESH: Partial<DexInput> = {
  entries: [],
  trips: [],
  crewCounts: [],
  me: {
    id: 'me',
    display_name: 'Nguyễn Thị Thanh Hương',
    home_country: 'VN',
    explore_at_home: 0,
    hide_collection: 0,
    active_crew_id: null,
  },
};

function egg(kind: EggCard['kind'], place = 'Bali'): EggCard {
  return {
    kind,
    tripId: 'trip-bali',
    eggId: 'egg-bali',
    place,
    colour: null,
    formId: 'cp-112-common',
    guideSlug: 'tokek',
    guideName: 'Tokek',
    startDate: '2027-03-30',
    endDate: '2027-04-06',
  };
}

function Pass({
  input = {},
  filter: initial = 'all',
  query: initialQuery = '',
  egg: eggCard = null,
  near = new Set<string>(),
  state = 'ready',
  explore = false,
}: {
  readonly input?: Partial<DexInput>;
  readonly filter?: DexFilter;
  readonly query?: string;
  readonly egg?: EggCard | null;
  readonly near?: ReadonlySet<string>;
  readonly state?: 'loading' | 'ready';
  readonly explore?: boolean;
}) {
  const [filter, setFilter] = useState<DexFilter>(initial);
  const [query, setQuery] = useState(initialQuery);
  const [exploreOn, setExploreOn] = useState(explore);
  const model = buildDex(labDexInput(input));
  return (
    <DexView
      state={state}
      model={model}
      near={near}
      filter={filter}
      onFilter={setFilter}
      query={query}
      onQuery={setQuery}
      egg={eggCard}
      onHatch={noop}
      onOpenHatch={noop}
      exploreAtHome={model.home === null ? null : exploreOn}
      onExploreAtHome={setExploreOn}
      onOpenSet={noop}
      onOpenCritter={noop}
      onOpenLegendaries={noop}
    />
  );
}

function SetScene({
  input = {},
  code,
}: {
  readonly input?: Partial<DexInput>;
  readonly code: string;
}) {
  const model = buildDex(labDexInput(input));
  const set =
    [
      ...(model.hereNow === null ? [] : [model.hereNow.set]),
      ...(model.home === null ? [] : [model.home]),
      ...model.places,
    ].find((s) => s.id === `set-${code}`) ?? null;
  return <SetView set={set} onOpenCritter={noop} />;
}

const TOKEK_HATCH: HatchViewProps = {
  place: 'Bali',
  landedTime: '13:50',
  landedAirport: 'DPS',
  colour: null,
  critterKey: 'cp-112',
  seed: 7,
  form: null,
  name: 'Tokek',
  isGuide: true,
  days: 8,
  no: 1,
  setName: 'Bali',
  pending: false,
  onSayHi: noop,
  onLater: noop,
};

export const DEX_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3l-2-pass': () => <Pass />,
  '3l-2-legendary-on-dates': () => (
    <Pass input={{ trips: [labTrip({ start_date: '2027-04-01', end_date: '2027-04-08' })] }} />
  ),
  '3l-2-egg-waiting': () => (
    <Pass
      input={{ trips: [labTrip({ status: 'pre_trip', egg_hatched_at: null })] }}
      egg={egg('waiting')}
    />
  ),
  '3l-2-egg-ready': () => (
    <Pass input={{ trips: [labTrip({ egg_hatched_at: null })] }} egg={egg('ready')} />
  ),
  '3l-2-egg-unseen': () => <Pass egg={egg('unseen')} />,
  '3l-2-found': () => <Pass filter="found" />,
  '3l-2-near': () => <Pass filter="near" near={new Set(['cp-112', 'cp-113', 'cp-114'])} />,
  '3l-2-search': () => <Pass query="Hội An" />,
  '3l-2-crew-hidden': () => <Pass input={{ crewCounts: [] }} />,
  '3l-2-explore-at-home': () => <Pass input={{ trips: [] }} explore />,
  '3l-2-loading': () => <Pass state="loading" />,
  '3l-2-fresh': () => <Pass input={FRESH} />,
  '3l-2-fresh-found-empty': () => <Pass input={FRESH} filter="found" />,
  '3l-2-fresh-near-empty': () => <Pass input={FRESH} filter="near" />,
  '3l-2-fresh-long-names': () => (
    <Pass
      input={{
        ...FRESH,
        crewCounts: [
          { user_id: 'max', critters: 3, forms: 3, display_name: 'Maximiliana Whitfield-Nguyễn' },
        ],
        trips: [
          labTrip({
            status: 'pre_trip',
            destination_name: 'Thành phố Hồ Chí Minh',
            egg_hatched_at: null,
          }),
        ],
      }}
      egg={egg('waiting', 'Thành phố Hồ Chí Minh')}
    />
  ),
  '3l-8-home-set': () => <SetScene code="vn" />,
  '3l-8-fresh': () => <SetScene code="vn" input={FRESH} />,
  '3l-1-hatch': () => <HatchView {...TOKEK_HATCH} />,
  '3l-1-hatch-offline': () => <HatchView {...TOKEK_HATCH} pending />,
  '3l-1-hatch-local': () => (
    <HatchView
      {...TOKEK_HATCH}
      place="Đà Nẵng"
      critterKey="cp-001"
      seed={1}
      name={null}
      isGuide={false}
      no={1}
      setName="Vietnam"
      landedTime={null}
      landedAirport={null}
      pending
      onSayHi={null}
    />
  ),
};
