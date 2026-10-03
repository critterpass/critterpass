/**
 * The recap page (3m-1) over synced rows: holds the trip's streams (the recap and its awards ride
 * them), reads the page's model from the local database, retries a failed build, shares the recap
 * card, and WHERE NEXT? goes back to Home, where the crew's next destination vote lives.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and route paths, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router, type Href } from 'expo-router';
import { useContext, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { useScreenHref } from '@/lib/navigation/screen-registry';
import { feedback, toast } from '@/motion';
import { GUIDE_STICKERS, isGuideStickerId } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { SessionWaiting } from '@/ui/states/SessionWaiting';

import { retryRecapCommand } from '../commands';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { useRecapSummary } from '../data/use-recap-summary';
import { RecapShareSheet } from './share-sheet';
import { SummaryView } from './summary-view';

const UNIT_SQL = 'SELECT distance_unit FROM user_settings WHERE user_id = ?';

function guideOf(slug: string | null): GuideId {
  return slug !== null && isGuideStickerId(slug) ? slug : 'tokek';
}

/** Home, with the trip's crew in front: its destination vote is where "where next" is decided. */
export function whereNextHref(crewId: string | null): Href {
  return crewId === null ? '/' : { pathname: '/', params: { crewId } };
}

function RecapSummary({ tripId }: { readonly tripId: string }) {
  useTripStreams(tripId);
  const { t } = useLingui();
  const me = useOwnerUid();
  const sync = useSyncStatus();
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
  const guideName = data.guideName ?? GUIDE_STICKERS[guide].name;
  const legendaryHref = useScreenHref('3l-9');
  const { model } = data;

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
        model={model}
        guide={guide}
        guideName={guideName}
        unit={unit}
        offline={sync.phase === 'offline'}
        retrying={retry.pending}
        onRetry={() => void onRetry()}
        onShare={() => setSharing(true)}
        onWhereNext={() => router.navigate(whereNextHref(data.crewId))}
        onGotAway={legendaryHref === undefined ? undefined : () => router.push(legendaryHref)}
      />
      {sharing ? (
        <RecapShareSheet
          model={model}
          guide={guide}
          unit={unit}
          onClose={() => setSharing(false)}
        />
      ) : null}
    </>
  );
}

export function RecapSummaryScreen({ tripId }: { readonly tripId: string }) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return <SessionWaiting testID="recap-waiting" />;
  return <RecapSummary tripId={tripId} />;
}
