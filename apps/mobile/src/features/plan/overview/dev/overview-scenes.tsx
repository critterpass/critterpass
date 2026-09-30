/**
 * Lab scenes for the trip plan overview (3e-1) and its states over the Bali week, built through
 * the same model as the app, with every handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { calendarMonths } from '../../views/model/views-model';
import { PlanCalendar } from '../../views/plan-calendar';
import { PlanMap } from '../../views/plan-map';
import { buildDayCards, type DayCard } from '../model/plan-model';
import { PlanOverviewView, type PlanOverviewViewProps } from '../plan-overview-view';
import { ALEX, BALI_DAYS, BALI_ITEMS, BALI_POLLS, BALI_WEATHER, MAYA } from './bali-plan';

const noop = () => undefined;

export function baliCards(today: string | null = null): DayCard[] {
  return buildDayCards({
    days: BALI_DAYS,
    items: BALI_ITEMS,
    polls: BALI_POLLS,
    weather: BALI_WEATHER,
    today,
  });
}

export const LAB_HERE = [
  { key: MAYA, name: 'Maya', joinIndex: 1 },
  { key: ALEX, name: 'Alex', joinIndex: 4 },
];

export function overviewProps(
  overrides: Partial<PlanOverviewViewProps> = {},
): PlanOverviewViewProps {
  return {
    state: { kind: 'ready' },
    destination: 'Bali',
    guide: { id: 'tokek', name: 'Tokek' },
    here: LAB_HERE,
    tab: 'list',
    onTab: noop,
    mapView: (
      <PlanMap
        days={BALI_DAYS}
        items={BALI_ITEMS}
        destinationSlug="bali"
        localRegionUri={null}
        offlineUnavailable={false}
        onDownload={null}
        onOpenItem={noop}
      />
    ),
    calendarView: (
      <PlanCalendar months={calendarMonths(BALI_DAYS, BALI_ITEMS, null)} onOpenDay={noop} />
    ),
    cards: baliCards(),
    canReorder: true,
    readOnly: false,
    draft: null,
    offline: null,
    conflict: null,
    sweepDays: new Set(),
    onSwept: noop,
    shakes: new Map(),
    onOpenDay: noop,
    onReorder: () => 'moved',
    onBack: noop,
    ...overrides,
  };
}

function scene(overrides: Partial<PlanOverviewViewProps> = {}): () => ReactNode {
  return function Scene() {
    return <PlanOverviewView {...overviewProps(overrides)} />;
  };
}

export const OVERVIEW_SCENES: Readonly<Record<string, () => ReactNode>> = {
  overview: scene(),
  'overview-sweep': scene({ sweepDays: new Set([3]) }),
  'overview-loading': scene({ state: { kind: 'loading' } }),
  'overview-empty': scene({ state: { kind: 'no_plan', onSetup: noop }, here: [] }),
  'overview-empty-member': scene({ state: { kind: 'no_plan', onSetup: null }, here: [] }),
  'overview-offline': scene({
    offline: { lastSyncedAt: new Date(Date.now() - 42 * 60 * 1000) },
    here: [],
  }),
  'overview-conflict': scene({ conflict: { onDismiss: noop } }),
  'overview-read-only': scene({ readOnly: true, canReorder: false }),
  'overview-in-trip': scene({ cards: baliCards('2026-11-04') }),
  'overview-draft': scene({ draft: { onReview: noop }, here: [], canReorder: false }),
};
