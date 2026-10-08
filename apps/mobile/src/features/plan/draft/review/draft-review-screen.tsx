/**
 * The private draft wired to the phone. Organisers see their draft (synced on `trip_draft`, which
 * the server serves to organisers only); anyone else sees that an organiser is planning and
 * nothing of the draft. With no draft yet it offers to start one, or to try again after a draft
 * that failed; while a draft is still being made it goes to the drafting screen.
 */
import { t } from '@lingui/core/macro';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { toast } from '@/motion';
import { guideSticker } from '@/ui/avatar/guides';

import { draftBackLabel } from './draft-copy';
import { restoreDraftVersionCommand } from '../data/commands';
import { useDecidedRedrafts } from '../data/decided-redrafts';
import { isBeingDrafted, isDraftRetired } from '../data/draft-stage';
import { useDraftTrip } from '../data/draft-trip';
import { roomiestDay } from '../data/fit-day';
import { dayRange } from '../data/format';
import { useDraftVersion, type HistoryEntry } from '../data/use-draft-version';
import { draftRoutes } from '../routes';
import { missAction, type MissedMustDo } from './coverage-strip';
import { DraftLoading } from './draft-loading';
import { DraftReviewView } from './draft-review-view';
import { MemberPlanning } from './member-planning';
import { NoDraft } from './no-draft';
import { VersionHistorySheet } from './version-history-sheet';

export function DraftReviewScreen({ tripId }: { readonly tripId: string }) {
  useTripStreams(tripId);
  const trip = useDraftTrip(tripId);
  const draft = useDraftVersion(trip);
  const decided = useDecidedRedrafts();
  const locale = useLocale();
  const syncPhase = useSyncPhase();
  const restore = useCommand(restoreDraftVersionCommand);
  const [history, setHistory] = useState(false);
  // The day she last opened: Change a day starts there, not on day 1.
  const [lastDay, setLastDay] = useState<number | null>(null);
  const drafting = trip !== undefined && trip !== null && isBeingDrafted(trip, draft.lastDraftJob);
  const retired = trip !== undefined && trip !== null && isDraftRetired(trip);

  // Only while this is the screen on top: one underneath never navigates.
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    if (retired) router.replace(hrefFor('plan-hub', { tripId }) ?? '/');
    else if (drafting) router.replace(draftRoutes.drafting(tripId));
  }, [drafting, focused, retired, tripId]);

  const back = () => goBackOr(draftRoutes.setup(tripId) ?? '/');
  if (trip === undefined || trip === null || !draft.loaded || drafting || retired) {
    return (
      <DraftLoading
        trip={
          trip === undefined || trip === null
            ? null
            : { destination: trip.destinationName, guide: trip.guide }
        }
        onBack={back}
      />
    );
  }
  if (!trip.isOrganiser)
    return (
      <MemberPlanning trip={trip} onBack={() => goBackOr(hrefFor('plan-hub', { tripId }) ?? '/')} />
    );
  if (draft.review === null) {
    return (
      <NoDraft
        guide={trip.guide}
        failed={draft.lastDraftJob?.status === 'failed'}
        backLabel={draftBackLabel(trip.destinationName)}
        onBack={back}
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
  // A redraft she has kept or put back is not offered again while that waits to send.
  const open =
    draft.openRedraft === null || decided.has(draft.openRedraft.id) ? null : draft.openRedraft;
  const review = draft.review;
  const fitIn = (titles: readonly string[]) => {
    const what = titles.join(', ');
    return what === ''
      ? undefined
      : t({ id: 'planDraft.change.fitIn', message: `Fit in: ${what}` });
  };
  const onChangeDay = (free: boolean) => {
    // A must-do added after the draft: the roomiest day, with what to fit in already written.
    if (free) {
      router.push(
        draftRoutes.changeDay(
          tripId,
          roomiestDay(review.days),
          true,
          fitIn(review.lateMustDoTitles),
        ),
      );
    } else router.push(draftRoutes.changeDay(tripId, lastDay ?? undefined));
  };
  const onFixMiss = (miss: MissedMustDo) => {
    if (missAction(miss.reason) === 'pick_place') {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a design screen id, never copy.
      const add = hrefFor('3c-10', { tripId });
      if (add !== undefined) router.push(add);
    } else {
      router.push(
        draftRoutes.changeDay(tripId, roomiestDay(review.days), false, fitIn([miss.title])),
      );
    }
  };
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
        offline={syncPhase === 'offline'}
        openRedraft={
          open === null
            ? null
            : { dayNo: open.dayNo, ready: open.status !== 'queued' && open.status !== 'running' }
        }
        hasHistory={draft.history.length > 1}
        onBack={back}
        onPropose={propose === undefined ? undefined : () => router.push(propose)}
        onChangeDay={onChangeDay}
        onFixMiss={onFixMiss}
        onOpenDay={
          day === undefined
            ? undefined
            : (dayNo) => {
                setLastDay(dayNo);
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
          guideName={guideSticker(trip.guide).name}
          locale={locale}
          onRestore={onRestore}
          onClose={() => setHistory(false)}
        />
      ) : null}
    </>
  );
}
