/**
 * A published shared plan's state once read: the heart (saved on the phone offline; a refusal puts
 * it back), the guide's overlap note, whether this person copies or suggests, the trip picker for a
 * plan opened outside a trip, taking the plan or one day, and reporting it. Either look draws it.
 */
import type { SharedPlanDetail } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useCommandFeedback } from '@/motion/island-toast';
import { guideSticker } from '@/ui/avatar/guides';

import { dataOf, useGuideNote, useTripSharedPlan } from '../api';
import { reportContent, saveSharedPlan, unsaveSharedPlan } from '../commands';
import { planReport, toastIds } from '../ids';
import { useTakePlan, type TakeTarget } from './use-take-plan';

export function usePlanView({
  detail,
  tripId,
  onChanged,
}: {
  readonly detail: SharedPlanDetail;
  readonly tripId: string | null;
  readonly onChanged: () => void;
}) {
  const { t } = useLingui();
  const card = detail.card;
  const [saved, setSaved] = useState(detail.saved);
  // A plan opened outside a trip (Explore, a link) gets its trip from the picker.
  const [picked, setPicked] = useState<TakeTarget | null>(null);
  const [picking, setPicking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const note = dataOf(useGuideNote(card.id, tripId).state);
  const tripRead = useTripSharedPlan(tripId).state;
  const trip = dataOf(tripRead);
  // Whether this person copies or suggests is unknown until the trip's read answers.
  const roleKnown = tripId === null || tripRead.status !== 'loading';
  const target: TakeTarget | null =
    tripId !== null ? { tripId, organiser: trip?.organiser === true } : picked;
  const { send: save } = useCommand(saveSharedPlan);
  const { send: unsave } = useCommand(unsaveSharedPlan);
  const { send: sendReport } = useCommand(reportContent);
  const { report } = useCommandFeedback();
  const guide = guideSticker(null);
  const taking = useTakePlan({ sharedPlanId: card.id, guideName: guide.name, onChanged });
  const bestDay = note?.best_day ?? null;
  const blocked = taking.busy || !roleKnown;

  const toggleSave = () => {
    const next = !saved;
    setSaved(next);
    void (next ? save : unsave)({ shared_plan_id: card.id }).then((result) => {
      // Saved on the phone when offline; only a refusal puts the heart back.
      if (report(result, { offlineCapable: true, id: toastIds.saved(card.id) }) === 'refused') {
        setSaved(!next);
      }
    });
  };
  const take = (dayNos?: readonly number[]) => {
    if (target === null) setPicking(true);
    else void taking.take(target, dayNos);
  };
  const fileReport = () => {
    setReporting(false);
    setReported(true);
    void sendReport(planReport(card.id)).then((result) => {
      const outcome = report(result, {
        offlineCapable: true,
        id: toastIds.reported(card.id),
        done: t({ id: 'community.detail.reported', message: 'Thanks. We will take a look.' }),
      });
      if (outcome === 'refused' || outcome === 'needs-signal') setReported(false);
    });
  };

  return {
    card,
    saved,
    note,
    target,
    taking,
    bestDay,
    blocked,
    picking,
    reporting,
    reported,
    toggleSave,
    take,
    fileReport,
    pick: (next: TakeTarget) => {
      setPicked(next);
      void taking.take(next);
    },
    closePicker: () => setPicking(false),
    askReport: () => setReporting(true),
    cancelReport: () => setReporting(false),
  };
}
