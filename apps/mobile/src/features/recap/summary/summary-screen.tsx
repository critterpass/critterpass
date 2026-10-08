/**
 * The recap page (3m-1) over synced rows: holds the trip's streams (the recap and its awards ride
 * them), reads the page's model from the local database, retries a failed build, shares the recap
 * (its card as an image, or a link to its public page), and WHERE NEXT? goes back to Home, where the crew's next destination vote lives.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and route paths, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router, type Href } from 'expo-router';
import { useContext, useEffect, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { goBackOr } from '@/lib/navigation/back';
import { useScreenHref } from '@/lib/navigation/screen-registry';
import { feedback, toast } from '@/motion';
import { guideSticker, isGuideStickerId } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { SessionWaiting } from '@/ui/states/SessionWaiting';

import { retryRecapCommand } from '../commands';
import { recapRoutes } from '../routes';
import { RecapEndSlot } from '../story/RecapEndSlot';
import { storySession } from '../story/story-session';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { useRecapSummary } from '../data/use-recap-summary';
import { useRecapLinkActions } from '../link/use-recap-link';
import { RecapShare } from './share-choice-sheet';
import { SummaryView } from './summary-view';

const UNIT_SQL = 'SELECT distance_unit FROM user_settings WHERE user_id = ?';

export function guideOf(slug: string | null): GuideId {
  return slug !== null && isGuideStickerId(slug) ? slug : 'tokek';
}

/** Home, with the trip's crew in front: its destination vote is where "where next" is decided. */
export function whereNextHref(crewId: string | null): Href {
  return crewId === null ? '/' : { pathname: '/', params: { crewId } };
}

function RecapSummary({ tripId, ended }: { readonly tripId: string; readonly ended: boolean }) {
  useTripStreams(tripId);
  const { t } = useLingui();
  const me = useOwnerUid();
  const syncPhase = useSyncPhase();
  const data = useRecapSummary(tripId);
  const retry = useCommand(retryRecapCommand);
  const [sharing, setSharing] = useState(false);
  const unitRow = useLiveRows<{ distance_unit: string | null }>(
    UNIT_SQL,
    me === null ? null : [me],
    ['user_settings'],
  ).rows[0];
  const unit = unitRow?.distance_unit === 'imperial' ? 'imperial' : 'metric';
  const guide = guideOf(data.guideSlug);
  const guideName = data.guideName ?? guideSticker(guide).name;
  const target = data.formsTarget;
  const critterHref = useScreenHref('3l-3', target?.screen === '3l-3' ? target.params : {});
  const setHref = useScreenHref('3l-8', target?.screen === '3l-8' ? target.params : {});
  const formsHref = target === null ? undefined : target.screen === '3l-3' ? critterHref : setHref;
  const rateHref = useScreenHref('3o-3', { tripId });
  const albumHref = useScreenHref('3m-2', { tripId });
  const postcardHref = useScreenHref('3m-9', { tripId });
  const { model } = data;
  const recapId = data.recapId;
  const link = useRecapLinkActions(model.phase === 'ready' ? recapId : null);

  // A ready recap plays as a story first: once per session, until it has been watched to the end.
  const autoplay =
    !ended &&
    model.phase === 'ready' &&
    recapId !== null &&
    data.viewLoaded &&
    !data.watched &&
    !storySession.played(recapId);
  useEffect(() => {
    if (autoplay) router.replace(recapRoutes.story(tripId));
  }, [autoplay, tripId]);
  // Until it is known whether the story plays first, the page waits, so its numbers never flash
  // before the story takes over.
  const settling =
    !ended &&
    model.phase === 'ready' &&
    recapId !== null &&
    !storySession.played(recapId) &&
    (!data.viewLoaded || !data.watched);

  async function onRetry() {
    if (retry.pending) return;
    const result = await retry.send({ trip_id: tripId });
    if (result.kind === 'applied') {
      feedback.emit('success');
      return;
    }
    feedback.emit('error');
    toast.show({
      id: 'recap-retry',
      title:
        result.kind === 'unavailable'
          ? t({ id: 'recap.summary.retry.offline', message: 'Needs signal to try again' })
          : t({ id: 'recap.summary.retry.failed', message: "Couldn't ask for it again" }),
    });
  }

  return (
    <>
      <SummaryView
        model={settling ? { ...model, phase: 'loading' } : model}
        guide={guide}
        guideName={guideName}
        unit={unit}
        offline={syncPhase === 'offline'}
        retrying={retry.pending}
        onRetry={() => void onRetry()}
        onShare={() => setSharing(true)}
        onWhereNext={() => router.navigate(whereNextHref(data.crewId))}
        onBack={() => goBackOr()}
        onGotAway={formsHref === undefined ? undefined : () => router.push(formsHref)}
        onWatch={
          model.phase === 'ready' ? () => router.push(recapRoutes.story(tripId, true)) : undefined
        }
        onRate={rateHref === undefined ? undefined : () => router.push(rateHref)}
        onPhotos={albumHref === undefined ? undefined : () => router.push(albumHref)}
        onPostcard={postcardHref === undefined ? undefined : () => router.push(postcardHref)}
      />
      {ended && recapId !== null ? <RecapEndSlot recapId={recapId} /> : null}
      {sharing ? (
        <RecapShare
          model={model}
          guide={guide}
          unit={unit}
          link={link}
          onClose={() => setSharing(false)}
        />
      ) : null}
    </>
  );
}

export function RecapSummaryScreen({
  tripId,
  ended = false,
}: {
  readonly tripId: string;
  readonly ended?: boolean;
}) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return <SessionWaiting testID="recap-waiting" />;
  return <RecapSummary tripId={tripId} ended={ended} />;
}
