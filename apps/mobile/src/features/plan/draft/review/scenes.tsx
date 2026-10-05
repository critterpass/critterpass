/** The private draft (3c-9) and its states over the Kyoto fixture, for the developer scenes. */
/* eslint-disable lingui/no-unlocalized-strings -- scene names and fixture ids, never copy. */
import { useEffect, useState } from 'react';

import type { ReviewModel } from '../data/version';
import {
  REVIEW,
  REVIEW_BOOKED,
  REVIEW_DETAILS,
  REVIEW_MISSING,
  LOCALE_DATES,
  REVIEW_OVER,
  REVIEW_STALE,
  TRIP,
} from '../scenes/fixtures';
import { exitScene, InLocale, type DraftScene } from '../scenes/types';
import { dayRange } from '../data/format';
import { DraftLoading, type DraftLoadingProps } from './draft-loading';
import { DraftReviewView, type DraftReviewViewProps } from './draft-review-view';
import { MemberPlanning } from './member-planning';
import { NoDraft } from './no-draft';
import type { HistoryEntry } from '../data/use-draft-version';
import { VersionHistorySheet } from './version-history-sheet';

const noop = () => undefined;

const LOADING_TRIP: NonNullable<DraftLoadingProps['trip']> = { destination: 'Kyoto', guide: 'pon' };

/** The trip row still syncing when the draft opens, landing a few seconds later. */
function SlowTripLoading() {
  const [trip, setTrip] = useState<DraftLoadingProps['trip']>(null);
  useEffect(() => {
    const timer = setTimeout(() => setTrip(LOADING_TRIP), 4000);
    return () => clearTimeout(timer);
  }, []);
  return <DraftLoading trip={trip} onBack={exitScene} />;
}

export function reviewProps(locale: string, model: ReviewModel = REVIEW): DraftReviewViewProps {
  return {
    guide: 'pon',
    destination: 'Kyoto',
    dates: dayRange(locale, LOCALE_DATES.start, LOCALE_DATES.end),
    locale,
    model,
    quota: TRIP.quota,
    offline: false,
    openRedraft: null,
    hasHistory: false,
    onBack: noop,
    onPropose: noop,
    onChangeDay: noop,
    onOpenDay: noop,
    onOpenRedraft: noop,
    onHistory: noop,
  };
}

function scene(
  name: string,
  props: Partial<DraftReviewViewProps>,
  model?: ReviewModel,
): DraftScene {
  return {
    name,
    render: () => (
      <InLocale
        render={(locale) => <DraftReviewView {...reviewProps(locale, model)} {...props} />}
      />
    ),
  };
}

const earlier = (
  id: string,
  createdAt: string,
  origin: HistoryEntry['origin'],
  costPpMinor: number,
): HistoryEntry => ({
  id,
  createdAt,
  current: id === 'v-3',
  origin,
  days: 8,
  costPpMinor,
  currency: 'USD',
});

const OWN_PLAN_HISTORY: readonly HistoryEntry[] = [
  earlier('v-3', '2027-02-10T09:40:00Z', { kind: 'changed' }, 131_000),
  earlier('v-4', '2027-02-10T09:20:00Z', { kind: 'put_back', dayNo: 1 }, 136_000),
  earlier('v-2', '2027-02-10T09:12:00Z', { kind: 'first' }, 138_000),
  earlier('v-1', '2027-02-09T21:05:00Z', { kind: 'own' }, 21_000),
];

export const REVIEW_SCENES: readonly DraftScene[] = [
  scene('3c-9-draft', {}),
  scene('draft-booked', {}, REVIEW_BOOKED),
  scene('draft-must-do-missing', {}, REVIEW_MISSING),
  scene('draft-over-budget', {}, REVIEW_OVER),
  scene(
    'draft-left-out',
    {},
    {
      ...REVIEW_MISSING,
      leftOut: [
        { poiId: 'left-1', name: 'Fushimi Inari', reason: 'held_in_the_way' },
        { poiId: 'left-2', name: 'Nijo Castle', reason: 'closed' },
        { poiId: 'left-3', name: 'Arashiyama', reason: 'a reason this app does not know' },
      ],
    },
  ),
  scene('draft-stale', {}, REVIEW_STALE),
  scene('draft-stays-closures', { hasHistory: true }, REVIEW_DETAILS),
  scene('draft-redraft-waiting', { openRedraft: { dayNo: 4, ready: true } }),
  scene('draft-redrafting', { openRedraft: { dayNo: null, ready: false } }),
  scene('draft-offline', { offline: true }),
  scene('draft-quota-reached', { quota: { used: 3, limit: 3 } }),
  {
    name: 'draft-history',
    render: () => (
      <InLocale
        render={(locale) => (
          <>
            <DraftReviewView {...reviewProps(locale)} hasHistory />
            <VersionHistorySheet
              guideName="Pon"
              locale={locale}
              entries={[
                {
                  id: 'v-3',
                  createdAt: '2027-02-10T09:40:00Z',
                  current: true,
                  origin: { kind: 'redraft', dayNo: 2 },
                  days: 8,
                  costPpMinor: 131_000,
                  currency: 'USD',
                },
                {
                  id: 'v-2',
                  createdAt: '2027-02-10T09:12:00Z',
                  current: false,
                  origin: { kind: 'changed' },
                  days: 8,
                  costPpMinor: 138_000,
                  currency: 'USD',
                },
                {
                  id: 'v-1',
                  createdAt: '2027-02-09T21:05:00Z',
                  current: false,
                  origin: { kind: 'first' },
                  days: 8,
                  costPpMinor: 142_000,
                  currency: 'USD',
                },
              ]}
              onRestore={noop}
              onClose={exitScene}
            />
          </>
        )}
      />
    ),
  },
  {
    // She built a plan by hand, the guide drafted around it, and she changed the draft since.
    name: 'draft-history-own-plan',
    render: () => (
      <InLocale
        render={(locale) => (
          <>
            <DraftReviewView {...reviewProps(locale)} hasHistory />
            <VersionHistorySheet
              guideName="Pon"
              locale={locale}
              entries={OWN_PLAN_HISTORY}
              onRestore={noop}
              onClose={exitScene}
            />
          </>
        )}
      />
    ),
  },
  { name: 'draft-loading', render: () => <DraftLoading trip={LOADING_TRIP} onBack={exitScene} /> },
  { name: 'draft-loading-slow-data', render: () => <SlowTripLoading /> },
  // A guide outside the six-tile first-run grid: Chà Vá drafts Đà Nẵng.
  scene('draft-chava', { guide: 'chava', destination: 'Đà Nẵng' }),
  {
    name: 'draft-loading-chava',
    render: () => (
      <DraftLoading trip={{ destination: 'Đà Nẵng', guide: 'chava' }} onBack={exitScene} />
    ),
  },
  { name: 'draft-empty', render: () => <NoDraft guide="pon" failed={false} onDraft={noop} /> },
  { name: 'draft-failed', render: () => <NoDraft guide="pon" failed onDraft={noop} /> },
  {
    name: 'draft-member',
    render: () => <MemberPlanning trip={{ ...TRIP, isOrganiser: false }} onBack={noop} />,
  },
];
