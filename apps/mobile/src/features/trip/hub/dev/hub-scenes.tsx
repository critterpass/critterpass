/**
 * Lab scenes for the trip hub (3k-1) in every phase and state and the trip switcher, over the
 * Bali trip (Oct 12–19, six going), with every handler a no-op. The QUESTS tile here stands in for
 * the one the quests area registers.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import type { BriefingLine, BriefingState } from '../../briefing/briefing-model';
import { activityLine, bookingsTile, moneyTile, planTile, tileTitles } from '../hub-copy';
import type { HubHeader } from '../hub-model';
import { HubView, type HubViewProps } from '../hub-view';
import { HubTile, type HubTileData } from '../tiles';
import { TripListView } from '../../trip-list/trip-list-view';
import { guideColour } from '../guide';

const noop = () => undefined;
/** Sep 25, 18:33:31 Bali time: 17 days, 5 h 26 min 29 s before the first flight. */
const NOW = new Date('2026-09-25T10:33:31Z');
const WHEELS_UP = new Date('2026-10-12T16:00:00Z');

const LINES: readonly BriefingLine[] = [
  {
    id: 'b1',
    icon: 'plane',
    text: "Rin's flight moved to 22:40. I moved her pickup to match.",
    action: 'done',
    status: 'open',
    targets: [],
    deepLink: null,
  },
  {
    id: 'b2',
    icon: 'wallet',
    text: "Visa on arrival is $35, cash only. Dev and Alex haven't got any yet.",
    action: 'nudge',
    status: 'open',
    targets: [],
    deepLink: null,
  },
  {
    id: 'b3',
    icon: 'key',
    text: "The villa door code arrives Oct 11. I'll pin it to Day 1.",
    action: 'set',
    status: 'open',
    targets: [],
    deepLink: null,
  },
];

const TICKER = [
  'Alex moved snorkelling to 14:00',
  'Maya voted Nusa Penida',
  'Tokek held 6 boat seats',
  'Jordan added 12 photos',
].map((text, index) => ({ id: `a${index}`, text }));

function Hub({
  header = { phase: 'pre', target: WHEELS_UP },
  briefing = { kind: 'ready', lines: LINES, staleDate: null },
  money = { amount: '$186', sign: 1 },
  bookings = 9,
  quests = true,
  overrides = {},
}: {
  readonly header?: HubHeader;
  readonly briefing?: BriefingState;
  readonly money?: { readonly amount: string | null; readonly sign: number };
  readonly bookings?: number;
  readonly quests?: boolean;
  readonly overrides?: Partial<HubViewProps>;
}) {
  const plan = planTile(8, 2);
  const saved = bookingsTile(bookings, true);
  const owed = moneyTile(money.amount, money.sign);
  const titles = tileTitles();
  const tiles: HubTileData[] = [
    { key: 'plan', title: titles.plan, ...plan, icon: 'cal', tone: 'pink' },
    { key: 'bookings', title: titles.bookings, ...saved, icon: 'ticket', tone: 'blue' },
    { key: 'money', title: titles.money, ...owed, icon: 'wallet', tone: 'green' },
    ...(quests
      ? [
          {
            key: 'quests',
            title: 'Quests',
            value: '3 live',
            caption: 'crew level 7',
            icon: 'star' as const,
            tone: 'orange' as const,
          },
        ]
      : []),
  ];
  const props: HubViewProps = {
    state: 'ready',
    header,
    now: NOW,
    startDate: '2026-10-12',
    endDate: '2026-10-19',
    going: 6,
    destination: 'Bali',
    colour: guideColour('tokek'),
    guide: 'tokek',
    guideName: 'Tokek',
    guestGuide: false,
    planning: null,
    next: null,
    briefing,
    onAct: noop,
    tiles: tiles.map((tile) => ({
      key: tile.key,
      node: <HubTile tile={tile} compact={!quests} />,
    })),
    ticker: TICKER,
    onSwitch: null,
    ...overrides,
  };
  return <HubView {...props} />;
}

function Ticker() {
  const line = activityLine({
    id: 'x',
    actor_id: null,
    verb: 'edited',
    object_kind: 'trip',
    object_id: null,
    text: null,
    at: '',
    actor_name: 'Alex',
  });
  return <Hub overrides={{ ticker: [{ id: 'x', text: line }] }} />;
}

function Switcher() {
  return (
    <TripListView
      state="ready"
      trips={[
        {
          id: 't1',
          status: 'in_trip',
          start_date: '2026-10-12',
          end_date: '2026-10-19',
          destination_name: 'Bali',
          guide_slug: 'tokek',
        },
        {
          id: 't2',
          status: 'voting',
          start_date: null,
          end_date: null,
          destination_name: 'Kyoto',
          guide_slug: 'pon',
        },
      ]}
      onOpen={noop}
      onHome={noop}
    />
  );
}

export const HUB_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3k-1-pre-trip': () => <Hub />,
  '3k-1-planning': () => (
    <Hub
      header={{ phase: 'planning' }}
      briefing={{ kind: 'hidden' }}
      quests={false}
      overrides={{ startDate: null, endDate: null, planning: { label: 'Voting', onPress: noop } }}
    />
  ),
  '3k-1-travel-day': () => (
    <Hub
      header={{
        phase: 'travel',
        target: new Date('2026-09-25T13:43:31Z'),
        flight: {
          id: 'f',
          title: 'SQ 938 Singapore to Denpasar',
          departsAt: new Date('2026-09-25T09:00:00Z'),
          arrivesAt: new Date('2026-09-25T13:43:31Z'),
        },
      }}
      overrides={{
        next: {
          eyebrow: 'Your flight',
          time: '17:00',
          title: 'SQ 938 Singapore to Denpasar',
          detail: 'Lands 21:43',
          tone: 'raised',
          onPress: noop,
        },
      }}
    />
  ),
  '3k-1-in-trip': () => (
    <Hub
      header={{ phase: 'in', day: 4, days: 8 }}
      money={{ amount: '$42', sign: -1 }}
      overrides={{
        next: {
          eyebrow: 'Leave by',
          time: '03:10',
          title: 'Batur',
          detail: "Who's up, and what to pack",
          tone: 'pink',
          onPress: noop,
        },
      }}
    />
  ),
  '3k-1-post-trip': () => (
    <Hub
      header={{ phase: 'post', homeSince: '2026-10-19' }}
      briefing={{ kind: 'hidden' }}
      money={{ amount: null, sign: 0 }}
    />
  ),
  '3k-1-briefing-generating': () => <Hub briefing={{ kind: 'generating' }} />,
  '3k-1-briefing-empty': () => <Hub briefing={{ kind: 'empty' }} />,
  '3k-1-briefing-failed': () => <Hub briefing={{ kind: 'failed' }} />,
  '3k-1-briefing-stale': () => (
    <Hub briefing={{ kind: 'ready', lines: LINES.slice(1), staleDate: '2026-09-24' }} />
  ),
  '3k-1-briefing-acted': () => (
    <Hub
      briefing={{
        kind: 'ready',
        lines: LINES.map((line) =>
          line.action === 'nudge'
            ? { ...line, status: 'nudged' }
            : line.action === 'set'
              ? { ...line, status: 'set' }
              : line,
        ),
        staleDate: null,
      }}
    />
  ),
  '3k-1-no-bookings': () => <Hub bookings={0} quests={false} overrides={{ ticker: [] }} />,
  '3k-1-ticker-line': () => <Ticker />,
  '3k-1-guest-guide': () => <Hub overrides={{ guestGuide: true, onSwitch: noop }} />,
  '3k-1-loading': () => <Hub overrides={{ state: 'loading' }} />,
  'trips-switcher': () => <Switcher />,
  'trips-empty': () => <TripListView state="ready" trips={[]} onOpen={noop} onHome={noop} />,
};
