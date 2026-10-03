/**
 * The planning kit's components with the section 7 renders' Bali data, in English or Vietnamese
 * (the app's language), for the planning kit lab (its `kit` scene).
 */
/* eslint-disable lingui/no-unlocalized-strings -- lab sample copy, loaded only by (dev) screens. */
import { tokens } from '@cp/design-tokens';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Sticker } from '../../sticker/Sticker';
import { DayChips, type DayChip } from '../day-chips';
import { FilterChipRow } from '../filter-chip-row';
import { HourBars } from '../hour-bars';
import { MiniRouteSketch } from '../mini-route-sketch';
import { PlaceCard } from '../place-card';
import { ReasonGrid } from '../reason-grid';
import { StanceBar } from '../stance-bar';
import { TokekNote } from '../tokek-note';
import {
  ALEX,
  DANI,
  DayRowsSample,
  JORDAN,
  MAYA,
  OptionsSample,
  PlaceRowsSample,
  RIN,
  TimelineSample,
  useVi,
} from './kit-sample-groups';

const { color } = tokens;
const noop = () => undefined;

const DAY_COLORS = [
  color.yellow,
  color.pink,
  color.blue,
  color.orange,
  color.green.base,
  color.paper.base,
  color.yellow,
  color.pink,
];
const WEEK_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon'];
const WEEK_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN', 'T2'];
const FITS: DayChip['fit'][] = ['no', 'possible', 'no', 'possible', 'no', 'good', 'possible', 'no'];

function days(vi: boolean, withFit: boolean): DayChip[] {
  return DAY_COLORS.map((dayColor, index) => ({
    dayNo: index + 1,
    weekday: (vi ? WEEK_VI : WEEK_EN)[index] ?? '',
    color: dayColor,
    fit: withFit ? FITS[index] : undefined,
    accessibilityLabel: `Day ${String(index + 1)}`,
  }));
}

function DayChipsSample({ drop }: { readonly drop?: boolean }) {
  const vi = useVi();
  const [day, setDay] = useState(3);
  return (
    <DayChips
      days={days(vi, drop === true)}
      selectedDayNo={drop === true ? 6 : day}
      selectedFill={drop === true ? 'paper' : 'day'}
      onSelect={setDay}
      {...(drop === true ? { dropTarget: { overDayNo: 4 } } : {})}
    />
  );
}

function Tokek() {
  return <Sticker kind="gecko" name="Tokek" size={36} />;
}

/** Each sample as the gallery names it: component and state. */
export const KIT_SAMPLES: readonly {
  readonly component: string;
  readonly state: string;
  readonly render: () => ReactNode;
}[] = [
  { component: 'DayChips', state: 'trip map, day 3 chosen', render: () => <DayChipsSample /> },
  {
    component: 'DayChips',
    state: 'fit dots, drop target over day 4',
    render: () => <DayChipsSample drop />,
  },
  {
    component: 'FilterChipRow',
    state: 'counts, chosen and removable',
    render: () => (
      <FilterChipRow
        chips={[
          { key: 'all', label: 'All', count: 86, selected: true },
          { key: 'saved', label: 'Saved', count: 14 },
          { key: 'plan', label: 'In the plan', count: 22 },
          { key: 'food', label: 'Food', removable: true },
        ]}
        onPress={noop}
        onRemove={noop}
      />
    ),
  },
  {
    component: 'PlaceRow',
    state: 'places list and ideas',
    render: () => <PlaceRowsSample />,
  },
  {
    component: 'PlaceCard',
    state: 'picked, fits Sat',
    render: () => (
      <PlaceCard
        title="Tirta Empul"
        description="Water temple · 45 min from the villa"
        facts="Open 08:00–17:00 · Rp 75k"
        icon="temple"
        savers={[ALEX, RIN]}
        fit={{ text: 'Fits Sat · 08:00', tone: 'fits' }}
        picked
        onAdd={noop}
      />
    ),
  },
  {
    component: 'StopCard',
    state: 'day timeline with legs and a gap',
    render: () => <TimelineSample />,
  },
  {
    component: 'TokekNote',
    state: 'line with an action, and as a card',
    render: () => (
      <View style={{ gap: tokens.space['12'] }}>
        <TokekNote
          guide="tokek"
          name="Tokek"
          sticker={<Tokek />}
          line="Three things to fix before Oct 12."
          action={{ label: 'Check', onPress: noop }}
        />
        <TokekNote
          guide="tokek"
          name="Tokek"
          sticker={<Tokek />}
          line="3 things to fix, 2 to know."
          detail="Checked against opening hours, drives, bookings and everyone's saves."
          action={{ label: 'See', onPress: noop }}
        />
      </View>
    ),
  },
  { component: 'Planning DayRow', state: 'whole trip rows', render: () => <DayRowsSample /> },
  {
    component: 'MiniRouteSketch',
    state: 'a day and a flat day',
    render: () => (
      <View style={{ flexDirection: 'row', gap: tokens.space['12'] }}>
        <MiniRouteSketch
          color={color.blue}
          width={150}
          height={60}
          points={[
            { lat: -8.37, lng: 115.13 },
            { lat: -8.4, lng: 115.2 },
            { lat: -8.38, lng: 115.25 },
            { lat: -8.42, lng: 115.3 },
          ]}
        />
        <MiniRouteSketch
          color={color.pink}
          width={150}
          height={60}
          points={[
            { lat: 0, lng: 0 },
            { lat: 0, lng: 1 },
          ]}
        />
      </View>
    ),
  },
  {
    component: 'ReasonGrid',
    state: 'why 08:00',
    render: () => (
      <ReasonGrid
        reasons={[
          { key: 'open', icon: 'cal', text: 'Opens at 08:00' },
          { key: 'busy', icon: 'flame', text: 'Busy from 10' },
          { key: 'drive', icon: 'car', text: '45 min, Grab works' },
          { key: 'dry', icon: 'sun', text: 'Dry mornings in Oct' },
        ]}
      />
    ),
  },
  {
    component: 'StanceBar',
    state: 'split 2–2',
    render: () => (
      <StanceBar
        want={[MAYA, JORDAN]}
        ratherNot={[ALEX, DANI]}
        caption="Rin and you haven't said"
      />
    ),
  },
  {
    component: 'HourBars',
    state: 'slot at 08 lit',
    render: () => (
      <HourBars
        hours={[0.15, 0.2, 0.45, 0.6, 0.7, 0.62, 0.45, 0.4, 0.3, 0.2].map((level, index) => ({
          hour: 8 + index,
          level,
        }))}
        lit={{ from: 8, to: 9 }}
        accessibilityLabel="Quiet until 10, busiest at 12"
      />
    ),
  },
  { component: 'OptionRadioCard', state: 'two ways nobody loses', render: () => <OptionsSample /> },
];
