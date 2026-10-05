/**
 * Tokek is placing them (7h-6): the background placement made visible. The lines tick as the job
 * reports; the placed ideas pop into numbered stops in their day's colour; when the job is done the
 * screen gives way to the review of the placed set (7h-7). Leaving never cancels it: the review
 * waits as a card on the trip and a quiet ping.
 */
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useTripIdeas } from '@/data/ideas/use-trip-ideas';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { dayTileColour } from '@/features/plan/overview/model/day-colour';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { usePlanGuide } from '../../plan-guide';
import { ideaIcon } from '../idea-icon';
import { backToIdeas } from '../ideas-copy';
import { ideasRoute } from '../routes';
import type { MapPin } from './placing-map';
import { PlacingView, type PlacingLine } from './placing-view';
import { isFinished, PLACING_STEPS } from './progress';
import {
  dayNames,
  failedFoot,
  lineTexts,
  nothingFoot,
  placingFoot,
  placingTitle,
} from './placing-copy';
import { usePlacingJob } from './use-placing-job';

/* eslint-disable-next-line lingui/no-unlocalized-strings -- a design id, never copy. */
const REVIEW_ID = '7h-7';

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
  const guideName = usePlanGuide().name;
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
      title={placingTitle(count)}
      pins={pins}
      lines={lines}
      foot={failed ? failedFoot(guideName) : nothing ? nothingFoot() : placingFoot(guideName)}
      outcome={
        failed || nothing
          ? {
              action: backToIdeas(),
              onAction: () => router.replace(ideasRoute(tripId)),
            }
          : null
      }
      onLeave={() => (router.canGoBack() ? router.back() : router.replace(ideasRoute(tripId)))}
    />
  );
}
