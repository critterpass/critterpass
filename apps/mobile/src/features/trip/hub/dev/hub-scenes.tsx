/**
 * Lab scenes for the trip hub (3k-1) in every phase and state and the trip switcher, over the
 * Bali trip (Oct 12–19, six going) and a three-day Đà Nẵng one, with every handler a no-op. The
 * header, the entry row and the tiles get their words from the catalog and the app's formatters,
 * so a capture in another language shows that language's copy. The QUESTS tile here stands in for
 * the one the quests area registers.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { i18n } from '@lingui/core';
import type { ReactNode } from 'react';

import type { BriefingState } from '../../briefing/briefing-model';
import { useLocale } from '@/lib/i18n/use-locale';
import { VisitConsentRowView } from '@/ui/permission-primer/VisitConsentSheet';

import type { HubRows } from '../data/use-hub';
import {
  activityLine,
  bookingsTile,
  moneyTile,
  planTile,
  tileTitles,
  wholeMoney,
} from '../hub-copy';
import type { HubHeader } from '../hub-model';
import { exploreEntry, hubEntries, swipeEntry } from '../hub-next';
import { FLIGHT, LEAVE_BY, LINES, NOW, STOP, TICKER, TODAY, TZ, WHEELS_UP } from './hub-fixtures';
import { HubView, type HubViewProps } from '../hub-view';
import { HubTile, type HubTileData } from '../tiles';
import { TripListView } from '../../trip-list/trip-list-view';
import { guideColour } from '../guide';

const noop = () => undefined;
/** A message another area owns, by its id (never extracted into this area's catalog). */
const say = (id: string, values?: Record<string, unknown>) => i18n._(id, values);

function Hub({
  header = { phase: 'pre', target: WHEELS_UP },
  briefing = { kind: 'ready', lines: LINES, staleDate: null },
  money = { minor: 18_600, sign: 1 },
  bookings = 9,
  quests = true,
  today = TODAY,
  leaveBy = null,
  stop = null,
  overrides = {},
}: {
  readonly header?: HubHeader;
  readonly briefing?: BriefingState;
  readonly money?: { readonly minor: number | null; readonly sign: number };
  readonly bookings?: number;
  readonly quests?: boolean;
  /** Today on the trip's clock, for the entry row's day. */
  readonly today?: string;
  readonly leaveBy?: HubRows['leaveBy'];
  readonly stop?: HubRows['next'];
  readonly overrides?: Partial<HubViewProps>;
}) {
  const locale = useLocale();
  const plan = planTile(8, 2);
  const saved = bookingsTile(bookings, true);
  const owed = moneyTile(
    money.minor === null ? null : wholeMoney(locale, money.minor, 'USD'),
    money.sign,
  );
  const titles = tileTitles();
  const tiles: HubTileData[] = [
    { key: 'plan', title: titles.plan, ...plan, icon: 'cal', tone: 'pink' },
    { key: 'bookings', title: titles.bookings, ...saved, icon: 'ticket', tone: 'blue' },
    { key: 'money', title: titles.money, ...owed, icon: 'wallet', tone: 'green' },
    ...(quests
      ? [
          {
            key: 'quests',
            // The quests area's own tile strings, by id (its tile reads live data).
            title: say('quests.tile.title'),
            value: say('quests.tile.live', { 0: 3 }),
            caption: say('quests.tile.level', { level: 7 }),
            icon: 'star' as const,
            tone: 'orange' as const,
          },
        ]
      : []),
  ];
  const startDate = overrides.startDate === undefined ? '2026-10-12' : overrides.startDate;
  // The entry row through the screen's own derivation, so its labels come from the catalog.
  const entries = hubEntries({
    header,
    tripId: 't1',
    startDate,
    leaveBy,
    nextItem: stop,
    today,
    tz: TZ,
    locale,
  });
  const destination = overrides.destination ?? 'Bali';
  const props: HubViewProps = {
    state: 'ready',
    header,
    now: NOW,
    startDate,
    endDate: '2026-10-19',
    going: 6,
    destination,
    colour: guideColour('tokek'),
    guide: 'tokek',
    guideName: 'Tokek',
    guestGuide: false,
    planning: null,
    entries: entries.map((entry) => ({ ...entry, onPress: noop })),
    briefing,
    onAct: noop,
    tiles: tiles.map((tile) => ({
      key: tile.key,
      node: <HubTile tile={tile} />,
    })),
    explore: header.phase === 'planning' ? null : exploreEntry(destination, noop),
    swipe: header.phase === 'planning' ? null : swipeEntry(noop),
    ticker: TICKER,
    onSwitch: null,
    ...overrides,
  };
  return <HubView {...props} />;
}

/** A trip whose guide and place are not Bali's: Đà Nẵng with Chà Vá, three days. */
const DA_NANG: Partial<HubViewProps> = {
  destination: 'Đà Nẵng',
  colour: guideColour('chava'),
  guide: 'chava',
  guideName: 'Chà Vá',
  startDate: '2026-10-02',
  endDate: '2026-10-04',
  going: 4,
};

function Ticker() {
  const line = activityLine({ verb: 'edited', actor_name: 'Alex' });
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
  '3k-1-pre-trip-switch': () => <Hub overrides={{ onSwitch: noop }} />,
  '3k-1-planning': () => (
    <Hub
      header={{ phase: 'planning' }}
      briefing={{ kind: 'hidden' }}
      quests={false}
      overrides={{ startDate: null, endDate: null, planning: { label: 'Voting', onPress: noop } }}
    />
  ),
  '3k-1-travel-day': () => (
    <Hub header={{ phase: 'travel', target: FLIGHT.arrivesAt, flight: FLIGHT }} />
  ),
  '3k-1-in-trip': () => (
    <Hub
      header={{ phase: 'in', day: 2, days: 3 }}
      money={{ minor: 4_200, sign: -1 }}
      today="2026-10-03"
      leaveBy={{
        ...LEAVE_BY,
        leave_at: '2026-10-02T20:10:00Z',
        tz: 'Asia/Saigon',
        place_name: 'Bà Nà',
      }}
      overrides={{ ...DA_NANG, briefing: { kind: 'ready', lines: LINES, staleDate: null } }}
    />
  ),
  '3k-1-next-today': () => (
    <Hub header={{ phase: 'in', day: 2, days: 8 }} today="2026-10-13" stop={STOP} />
  ),
  // The day's stops are over: the next one is tomorrow's, and says so.
  '3k-1-next-tomorrow': () => (
    <Hub
      header={{ phase: 'in', day: 1, days: 3 }}
      briefing={{ kind: 'none', next: { on: 'tomorrow' } }}
      today="2026-10-02"
      stop={{
        ...STOP,
        poi_name: 'Chợ Cồn',
        starts_at: '2026-10-03T03:00:00Z',
        tz: 'Asia/Saigon',
        day_date: '2026-10-03',
      }}
      overrides={DA_NANG}
    />
  ),
  // The last day's evening: nothing ahead, today's page still one tap away.
  // A trip day before the traveller decided on visit memory: the quiet line to turn it on.
  '3k-1-visit-consent': () => (
    <Hub
      header={{ phase: 'in', day: 2, days: 3 }}
      today="2026-10-03"
      stop={{ ...STOP, starts_at: '2026-10-03T08:00:00Z', day_date: '2026-10-03' }}
      overrides={{ ...DA_NANG, visitConsent: <VisitConsentRowView onPress={noop} /> }}
    />
  ),
  '3k-1-day-done': () => (
    <Hub
      header={{ phase: 'in', day: 3, days: 3 }}
      briefing={{ kind: 'none', next: null }}
      today="2026-10-04"
      overrides={DA_NANG}
    />
  ),
  '3k-1-long-name': () => <Hub overrides={{ destination: 'Hồ Chí Minh', onSwitch: noop }} />,
  '3k-1-two-word-name': () => <Hub overrides={{ destination: 'Mexico City' }} />,
  '3k-1-post-trip': () => (
    <Hub
      header={{ phase: 'post', homeSince: '2026-10-19' }}
      briefing={{ kind: 'hidden' }}
      money={{ minor: null, sign: 0 }}
    />
  ),
  '3k-1-briefing-loading': () => <Hub briefing={{ kind: 'loading' }} />,
  '3k-1-briefing-none': () => <Hub briefing={{ kind: 'none', next: { on: 'tomorrow' } }} />,
  '3k-1-briefing-starts': () => (
    <Hub briefing={{ kind: 'none', next: { on: 'date', date: '2026-09-12' } }} />
  ),
  '3k-1-briefing-morning': () => <Hub briefing={{ kind: 'none', next: { on: 'today' } }} />,
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
