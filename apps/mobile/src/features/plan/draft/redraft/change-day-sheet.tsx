/**
 * Change a day wired to the phone: the organiser's current draft days (opening on the day the
 * caller names, with a note it may carry), the reason chips and note,
 * and the trip's redraft quota. REDRAFT goes straight ahead, raises the last-free-redraft
 * interstitial first when one is left, or offers the boost when none are.
 */
import { REDRAFT_NOTE_MAX, type RedraftReasonKey } from '@cp/domain';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import {
  forgetChangeDayAsk,
  rememberChangeDayAsk,
  rememberedChangeDayAsk,
} from '../data/change-day-ask';
import { useDraftTrip } from '../data/draft-trip';
import { redraftGate } from '../data/quota';
import { counterLine } from '../data/quota-copy';
import { useDraftVersion } from '../data/use-draft-version';
import { redraftBoost } from '../boost-slot';
import { draftRoutes } from '../routes';
import { BoostOffer } from './boost-offer';
import { ChangeDayView } from './change-day-view';
import { outcomeLine } from './outcome-copy';
import { DraftSheetWaiting } from './sheet-waiting';
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
  // What she chose and wrote before closing the sheet comes back with it; a caller that brings
  // its own note (something to fit in) starts from that instead.
  const [left] = useState(() => rememberedChangeDayAsk(tripId));
  const initialNote = useInitialNote();
  const [day, setDay] = useState(
    initialNote === '' ? (left?.day ?? initialDay ?? 1) : (initialDay ?? 1),
  );
  const [reasons, setReasons] = useState<ReadonlySet<RedraftReasonKey>>(
    () => new Set(left?.reasons ?? []),
  );
  const [note, setNote] = useState(initialNote === '' ? (left?.note ?? '') : initialNote);
  useEffect(() => {
    rememberChangeDayAsk(tripId, { day, reasons: [...reasons], note });
  }, [tripId, day, reasons, note]);
  const redraft = useSendRedraft(tripId, trip?.draftVersionId ?? null, 0, () =>
    forgetChangeDayAsk(tripId),
  );
  if (trip === undefined || trip === null || draft.review === null) {
    return (
      <DraftSheetWaiting
        tripId={tripId}
        gone={trip === null || (trip !== undefined && draft.loaded)}
      />
    );
  }

  const gate = redraftGate(trip.quota, free);
  const boost = redraftBoost();
  const spent = gate.kind === 'spent' || redraft.outcome?.kind === 'spent';
  const ask = { day, reasons: [...reasons], note, free };
  const onSubmit = () => {
    // Pushed over the sheet: closing the question returns here with everything as she left it.
    if (gate.kind === 'last') router.push(draftRoutes.lastRedraft(tripId, ask));
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
