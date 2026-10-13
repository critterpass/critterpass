/**
 * Rate the trip as state: the stack of places with the local answers applied, where it resumes,
 * the verdict and tip for the card on screen (nothing is sent until Next), sending each answer
 * (offline queue included), stepping back one to correct it, and tips moderation turned down.
 */
import type { RatingCard, PlaceVerdict } from '@cp/domain';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useCommandFeedback } from '@/motion/island-toast';

import { dataOf, useRatingCards } from '../api';
import { ratePlaces, type RateVerdict } from '../commands';
import { draftFor, rejectedTips, resumeIndex, verdictFor, withAnswers } from './rate-model';

const RATE_TOAST = 'community-rate';

export function useRateTrip(tripId: string) {
  const { state, reload } = useRatingCards(tripId);
  const data = dataOf(state);
  const [answers, setAnswers] = useState<ReadonlyMap<string, RateVerdict>>(new Map());
  const cards = useMemo(() => withAnswers(data?.cards ?? [], answers), [data, answers]);
  const [index, setIndex] = useState<number | null>(null);
  // The verdict and tip for the card on screen; nothing is sent until Next.
  const [picked, setPicked] = useState<PlaceVerdict | null>(null);
  const [tip, setTip] = useState('');
  const [waiting, setWaiting] = useState(false);
  const { send } = useCommand(ratePlaces);
  const { report } = useCommandFeedback();

  // Until she answers, the stack sits at the first place without a verdict.
  const at = index ?? (data === null ? 0 : resumeIndex(data.cards));
  const current: RatingCard | undefined = cards[at];
  const show = (next: number) => {
    // Going on starts clean; going back shows what was answered, to correct it.
    const draft = draftFor(next < at ? cards[next] : undefined);
    setPicked(draft.verdict);
    setTip(draft.tip);
    setIndex(next);
  };
  const next = () => {
    if (current === undefined || picked === null) return;
    const item = verdictFor(current, picked, tip);
    setAnswers((previous) => new Map(previous).set(current.poi_id, item));
    void send({ trip_id: tripId, verdicts: [item] }).then((result) => {
      const outcome = report(result, { offlineCapable: true, id: RATE_TOAST });
      setWaiting(outcome === 'queued');
    });
    show(at + 1);
  };
  const place = data?.destination_name ?? '';
  const turnedDown = rejectedTips(cards);

  return {
    state,
    reload,
    data,
    cards,
    at,
    current,
    picked,
    setPicked,
    tip,
    setTip,
    waiting,
    next,
    back: () => show(at - 1),
    place,
    turnedDown,
  };
}
