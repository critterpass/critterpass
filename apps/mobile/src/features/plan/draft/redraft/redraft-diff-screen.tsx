/**
 * The redraft screen wired to the phone: the redraft's job and diff, the trip's quota and the
 * organiser's per-change toggles. KEEP IT makes the redrafted day part of the private draft (the
 * changes toggled off stay as they were); "Put … back" discards it. Either one counts against the
 * quota; a redraft that failed or could not beat the day gave its unit back.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';
import { impact, toast } from '@/motion';

import { redraftBoost } from '../boost-slot';
import { keepRedraftCommand, revertRedraftCommand } from '../data/commands';
import { useDraftTrip } from '../data/draft-trip';
import { changeCards, excludedIds, metricChips, redraftPhase } from '../data/redraft';
import { useRedraft } from '../data/use-redraft';
import { draftRoutes } from '../routes';
import { RedraftDiffView } from './redraft-diff-view';

/** The guide's thinking beat lasts at least this long, however fast the job was. */
export const THINKING_BEAT_MS = 900;

export interface RedraftDiffScreenProps {
  readonly tripId: string;
  readonly redraftId: string;
  readonly day: number | null;
}

export function RedraftDiffScreen({ tripId, redraftId, day }: RedraftDiffScreenProps) {
  useTripStreams(tripId);
  const trip = useDraftTrip(tripId);
  const redraft = useRedraft(tripId, redraftId);
  const locale = useLocale();
  const keep = useCommand(keepRedraftCommand);
  const revert = useCommand(revertRedraftCommand);
  const [beatDone, setBeatDone] = useState(false);
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setBeatDone(true), THINKING_BEAT_MS);
    return () => clearTimeout(timer);
  }, []);
  const result = redraft.result;
  const cards = useMemo(
    () => (result === null ? [] : changeCards(result.changes, redraft.places)),
    [result, redraft.places],
  );
  if (trip === undefined || trip === null || !redraft.loaded) return null;

  const phase = leaving
    ? 'ready'
    : redraftPhase({
        status: redraft.status,
        outcome: result?.outcome ?? null,
        settled: redraft.settled,
        beatDone,
      });
  const dayNo = result?.day_no ?? day;
  const n = dayNo ?? 0;
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace(draftRoutes.review(tripId));
  };
  const boost = redraftBoost();
  const spent = trip.quota.limit !== null && trip.quota.used >= trip.quota.limit;
  const onKeep = () => {
    setLeaving(true);
    const title = result?.title ?? '';
    void keep.send({ redraft_id: redraftId, excluded_stable_ids: excludedIds(cards, off) });
    impact('success');
    toast.show({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- toast de-dupe key, never copy.
      id: `redraft-kept-${redraftId}`,
      title: t({ id: 'planDraft.diff.keptToast', message: `Day ${n} is ${title} now.` }),
      subtitle: t({ id: 'planDraft.diff.keptSub', message: 'Nobody else has seen it yet.' }),
    });
    back();
  };
  const onPutBack = () => {
    setLeaving(true);
    void revert.send({ redraft_id: redraftId });
    toast.show({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- toast de-dupe key, never copy.
      id: `redraft-reverted-${redraftId}`,
      title: t({ id: 'planDraft.diff.revertedToast', message: `Day ${n} is back as it was.` }),
    });
    back();
  };
  return (
    <RedraftDiffView
      guide={trip.guide}
      locale={locale}
      tz={trip.tz}
      phase={phase}
      dayNo={dayNo}
      summary={result?.summary ?? null}
      cards={cards}
      chips={metricChips(result?.metrics ?? null)}
      off={off}
      baseTitle={redraft.baseTitle}
      sending={keep.pending}
      onToggle={(key) => {
        const next = new Set(off);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setOff(next);
      }}
      onKeep={onKeep}
      onPutBack={onPutBack}
      onBack={back}
      onBoost={spent && boost !== null ? () => boost(tripId) : undefined}
    />
  );
}
