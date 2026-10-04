/**
 * Change a day wired to the phone: the organiser's current draft days (opening on the day the
 * caller names, with a note it may carry), the reason chips and note,
 * and the trip's redraft quota. REDRAFT goes straight ahead, raises the last-free-redraft
 * interstitial first when one is left, or offers the boost when none are.
 */
import { REDRAFT_NOTE_MAX, type RedraftReasonKey } from '@cp/domain';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { useDraftTrip } from '../data/draft-trip';
import { redraftGate } from '../data/quota';
import { counterLine } from '../data/quota-copy';
import { useDraftVersion } from '../data/use-draft-version';
import { redraftBoost } from '../boost-slot';
import { draftRoutes } from '../routes';
import { BoostOffer } from './boost-offer';
import { ChangeDayView } from './change-day-view';
import { outcomeLine } from './outcome-copy';
import { useSendRedraft } from './use-send-redraft';

export interface ChangeDaySheetProps {
  readonly tripId: string;
  readonly initialDay: number | null;
  readonly free: boolean;
}

/** The note the sheet opens with (`?note=`): what the caller already knows should change. */
function useInitialNote(): string {
  const { note } = useLocalSearchParams<{ note?: string }>();
  return typeof note === 'string' ? note.slice(0, REDRAFT_NOTE_MAX) : '';
}

export function ChangeDaySheet({ tripId, initialDay, free }: ChangeDaySheetProps) {
  const trip = useDraftTrip(tripId);
  const draft = useDraftVersion(trip);
  const locale = useLocale();
  const [day, setDay] = useState(initialDay ?? 1);
  const [reasons, setReasons] = useState<ReadonlySet<RedraftReasonKey>>(new Set());
  const [note, setNote] = useState(useInitialNote());
  const redraft = useSendRedraft(tripId, trip?.draftVersionId ?? null);
  if (trip === undefined || trip === null || draft.review === null) return null;

  const gate = redraftGate(trip.quota, free);
  const boost = redraftBoost();
  const spent = gate.kind === 'spent' || redraft.outcome?.kind === 'spent';
  const ask = { day, reasons: [...reasons], note, free };
  const onSubmit = () => {
    if (gate.kind === 'last') router.replace(draftRoutes.lastRedraft(tripId, ask));
    else void redraft.send(ask);
  };
  return (
    <ChangeDayView
      guide={trip.guide}
      destination={trip.destinationName}
      locale={locale}
      days={draft.review.days}
      day={day}
      onDay={(next) => {
        setDay(next);
        redraft.clear();
      }}
      reasons={reasons}
      onReason={(reason) => {
        const next = new Set(reasons);
        if (next.has(reason)) next.delete(reason);
        else next.add(reason);
        setReasons(next);
      }}
      note={note}
      onNote={setNote}
      problem={redraft.outcome === null ? null : outcomeLine(redraft.outcome)}
      counter={free ? null : counterLine(trip.quota)}
      sending={redraft.pending}
      spent={
        spent ? <BoostOffer onBoost={boost === null ? undefined : () => boost(tripId)} /> : null
      }
      onSubmit={onSubmit}
    />
  );
}
