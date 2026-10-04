/**
 * Tokek is placing them (7h-6): the background placement made visible. The lines tick as the job
 * reports; the placed ideas pop into numbered stops in their day's colour; when the job is done the
 * screen gives way to the review of the placed set (7h-7). Leaving never cancels it: the review
 * waits as a card on the trip and a quiet ping.
 */
import { plural, t } from '@lingui/core/macro';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useTripIdeas } from '@/data/ideas/use-trip-ideas';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { dayTileColour } from '@/features/plan/overview/day-card';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { ideaIcon } from '../idea-icon';
import { ideasRoute } from '../routes';
import type { MapPin } from './placing-map';
import { PlacingView, type PlacingLine } from './placing-view';
import { isFinished, PLACING_STEPS, type PlacingState } from './progress';
import { usePlacingJob } from './use-placing-job';

/* eslint-disable lingui/no-unlocalized-strings -- a design id and a date suffix, never copy. */
const REVIEW_ID = '7h-7';
const MIDDAY = 'T12:00:00Z';
/* eslint-enable lingui/no-unlocalized-strings */

function dayNames(dayNos: readonly number[], dates: ReadonlyMap<number, string>, locale: string) {
  const names = dayNos.flatMap((dayNo) => {
    const date = dates.get(dayNo);
    if (date === undefined) return [];
    const at = new Date(`${date}${MIDDAY}`);
    return [new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(at)];
  });
  if (names.length <= 1) return names[0] ?? '';
  const last = names[names.length - 1] ?? '';
  const first = names.slice(0, -1).join(', ');
  return t({ id: 'plan.placing.and', message: `${first} and ${last}` });
}

function lineTexts(state: PlacingState, count: number, days: string): Record<string, string> {
  const left = state.left ?? [];
  const split = left.filter((idea) => idea.reason === 'split').length;
  const leftCount = left.length;
  return {
    hours: t({
      id: 'plan.placing.hours',
      message: plural(count, { one: 'Opening hours for it', other: 'Opening hours for all #' }),
    }),
    locks: t({ id: 'plan.placing.locks', message: 'Nothing booked moves' }),
    routing:
      days === ''
        ? t({ id: 'plan.placing.routingDays', message: 'Routing the days' })
        : t({ id: 'plan.placing.routing', message: `Routing ${days}` }),
    needs_you:
      state.left === null
        ? t({ id: 'plan.placing.needsYouPending', message: 'Leaving what needs you for you' })
        : left.length === 0
          ? t({ id: 'plan.placing.needsYouNone', message: 'Nothing left over' })
          : split === left.length && split === 1
            ? t({ id: 'plan.placing.needsYouSplit', message: 'Leaving the split one for you' })
            : t({
                id: 'plan.placing.needsYouSome',
                message: plural(leftCount, {
                  one: 'Leaving one for you',
                  other: 'Leaving # for you',
                }),
              }),
  };
}

export function PlacingScreen({
  tripId,
  jobId,
}: {
  readonly tripId: string;
  readonly jobId: string;
}) {
  const locale = useLocale();
  const state = usePlacingJob(jobId);
  const plan = useTripPlan(tripId);
  const { ideas } = useTripIdeas(tripId);
  const dates = new Map(
    plan.dayRows.flatMap((row) => (row.date === null ? [] : [[row.day_no, row.date] as const])),
  );
  const count = state.ideas ?? ideas.length;
  const texts = lineTexts(state, count, dayNames(state.days ?? [], dates, locale));
  const lines: PlacingLine[] = PLACING_STEPS.map((step) => ({
    key: step,
    text: texts[step] ?? '',
    status: state.steps[step],
  }));
  const stops = new Map((state.placed ?? []).map((stop) => [stop.idea_id, stop]));
  const pins: MapPin[] = ideas.map((idea) => {
    const stop = stops.get(idea.id);
    return {
      id: idea.id,
      lat: idea.lat,
      lng: idea.lng,
      icon: ideaIcon(idea.category),
      stop: stop === undefined ? null : { number: stop.number, color: dayTileColour(stop.day_no) },
    };
  });

  const done = isFinished(state);
  const reviewId = state.status === 'succeeded' ? state.changeSetId : null;
  useEffect(() => {
    if (reviewId === null) return;
    const href: Href =
      hrefFor(REVIEW_ID, { tripId, changesetId: reviewId }) ??
      // eslint-disable-next-line lingui/no-unlocalized-strings
      (`/${tripId}/review/${reviewId}` as Href);
    router.replace(href);
  }, [reviewId, tripId]);

  const nothing = done && state.status === 'succeeded' && reviewId === null;
  const failed = done && state.status !== 'succeeded';
  return (
    <PlacingView
      title={t({
        id: 'plan.placing.title',
        message: plural(count, { one: 'PLACING\n1 IDEA', other: 'PLACING\n# IDEAS' }),
      })}
      pins={pins}
      lines={lines}
      foot={
        failed
          ? t({ id: 'plan.placing.failed', message: 'Tokek couldn’t place them this time.' })
          : nothing
            ? t({
                id: 'plan.placing.nothing',
                message: 'Nothing fits without moving something. What needs you is in Ideas.',
              })
            : t({
                id: 'plan.placing.foot',
                message: 'About ten seconds. Leave if you like, Tokek will ping you.',
              })
      }
      outcome={
        failed || nothing
          ? {
              action: t({ id: 'plan.placing.backToIdeas', message: 'Back to Ideas' }),
              onAction: () => router.replace(ideasRoute(tripId)),
            }
          : null
      }
      onLeave={() => (router.canGoBack() ? router.back() : router.replace(ideasRoute(tripId)))}
    />
  );
}
