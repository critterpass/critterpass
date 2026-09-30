/** The private draft (3c-9) and its states over the Kyoto fixture, for the developer scenes. */
/* eslint-disable lingui/no-unlocalized-strings -- scene names and fixture ids, never copy. */
import type { ReviewModel } from '../data/version';
import {
  REVIEW,
  REVIEW_DETAILS,
  REVIEW_MISSING,
  LOCALE_DATES,
  REVIEW_OVER,
  REVIEW_STALE,
  TRIP,
} from '../scenes/fixtures';
import { exitScene, InLocale, type DraftScene } from '../scenes/types';
import { dayRange } from '../data/format';
import { DraftReviewView, type DraftReviewViewProps } from './draft-review-view';
import { MemberPlanning } from './member-planning';
import { NoDraft } from './no-draft';
import { VersionHistorySheet } from './version-history-sheet';

const noop = () => undefined;

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

export const REVIEW_SCENES: readonly DraftScene[] = [
  scene('3c-9-draft', {}),
  scene('draft-must-do-missing', {}, REVIEW_MISSING),
  scene('draft-over-budget', {}, REVIEW_OVER),
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
              locale={locale}
              entries={[
                {
                  id: 'v-3',
                  createdAt: '2027-02-10T09:40:00Z',
                  current: true,
                  days: 8,
                  costPpMinor: 131_000,
                  currency: 'USD',
                },
                {
                  id: 'v-2',
                  createdAt: '2027-02-10T09:12:00Z',
                  current: false,
                  days: 8,
                  costPpMinor: 138_000,
                  currency: 'USD',
                },
                {
                  id: 'v-1',
                  createdAt: '2027-02-09T21:05:00Z',
                  current: false,
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
  { name: 'draft-empty', render: () => <NoDraft guide="pon" failed={false} onDraft={noop} /> },
  { name: 'draft-failed', render: () => <NoDraft guide="pon" failed onDraft={noop} /> },
  {
    name: 'draft-member',
    render: () => <MemberPlanning trip={{ ...TRIP, isOrganiser: false }} onBack={noop} />,
  },
];
