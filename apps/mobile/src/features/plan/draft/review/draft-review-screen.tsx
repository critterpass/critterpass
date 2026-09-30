/**
 * The private draft wired to the phone. Organisers see their draft (synced on `trip_draft`, which
 * the server serves to organisers only); anyone else sees that an organiser is planning and
 * nothing of the draft. With no draft yet it offers to start one, or to try again after a draft
 * that failed; while a draft is still being made it goes to the drafting screen.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { toast } from '@/motion';

import { restoreDraftVersionCommand } from '../data/commands';
import { useDraftTrip } from '../data/draft-trip';
import { dayRange } from '../data/format';
import { useDraftStreams } from '../data/streams';
import { useDraftVersion, type HistoryEntry } from '../data/use-draft-version';
import { draftRoutes } from '../routes';
import { DraftReviewView } from './draft-review-view';
import { MemberPlanning } from './member-planning';
import { NoDraft } from './no-draft';
import { VersionHistorySheet } from './version-history-sheet';

export function DraftReviewScreen({ tripId }: { readonly tripId: string }) {
  useDraftStreams(tripId);
  const trip = useDraftTrip(tripId);
  const draft = useDraftVersion(trip);
  const locale = useLocale();
  const sync = useSyncStatus();
  const restore = useCommand(restoreDraftVersionCommand);
  const [history, setHistory] = useState(false);
  const drafting =
    trip?.isOrganiser === true &&
    trip.draftVersionId === null &&
    (draft.lastDraftJob?.status === 'queued' || draft.lastDraftJob?.status === 'running');

  useEffect(() => {
    if (drafting) router.replace(draftRoutes.drafting(tripId));
  }, [drafting, tripId]);

  if (trip === undefined || trip === null || !draft.loaded || drafting) return null;
  if (!trip.isOrganiser)
    return (
      <MemberPlanning
        trip={trip}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    );
  if (draft.review === null) {
    return (
      <NoDraft
        guide={trip.guide}
        failed={draft.lastDraftJob?.status === 'failed'}
        onDraft={() => router.replace(draftRoutes.drafting(tripId))}
      />
    );
  }

  const onRestore = (entry: HistoryEntry) => {
    setHistory(false);
    void restore.send({ trip_id: tripId, version_id: entry.id });
    toast.show({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- toast de-dupe key, never copy.
      id: `draft-restored-${entry.id}`,
      title: t({ id: 'planDraft.history.restored', message: 'Earlier draft restored' }),
      subtitle: t({ id: 'planDraft.history.restoredSub', message: 'Still only you can see it.' }),
    });
  };
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a design screen id, never copy.
  const propose = hrefFor('3f-1', { tripId });
  const day = draftRoutes.day(tripId, 1);
  const open = draft.openRedraft;
  return (
    <>
      <DraftReviewView
        guide={trip.guide}
        destination={trip.destinationName}
        dates={
          trip.startDate === null || trip.endDate === null
            ? ''
            : dayRange(locale, trip.startDate, trip.endDate)
        }
        locale={locale}
        model={draft.review}
        quota={trip.quota}
        offline={sync.phase === 'offline'}
        openRedraft={
          open === null
            ? null
            : { dayNo: open.dayNo, ready: open.status !== 'queued' && open.status !== 'running' }
        }
        hasHistory={draft.history.length > 1}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace(draftRoutes.setup(tripId) ?? '/')
        }
        onPropose={propose === undefined ? undefined : () => router.push(propose)}
        onChangeDay={(free) => router.push(draftRoutes.changeDay(tripId, undefined, free))}
        onOpenDay={
          day === undefined
            ? undefined
            : (dayNo) => {
                const href = draftRoutes.day(tripId, dayNo);
                if (href !== undefined) router.push(href);
              }
        }
        onOpenRedraft={() => {
          if (open !== null) router.push(draftRoutes.redraft(tripId, open.id));
        }}
        onHistory={() => setHistory(true)}
      />
      {history ? (
        <VersionHistorySheet
          entries={draft.history}
          locale={locale}
          onRestore={onRestore}
          onClose={() => setHistory(false)}
        />
      ) : null}
    </>
  );
}
