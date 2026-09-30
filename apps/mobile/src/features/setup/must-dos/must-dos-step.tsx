/**
 * The must-dos step wired to the phone: synced must-dos plus this phone's queued list, crewmates
 * typing on `trip_presence`, removing your own (queued, works offline), lottery reminders, and
 * the organiser's "Draft my trip", which finishes setup and opens the drafting screen, which
 * starts the draft.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command values, route ids and date options, never copy. */
import { MUST_DOS_PER_MEMBER } from '@cp/domain';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTyping } from '@/data/realtime/use-typing';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { setMustDosCommand, setSetupStepCommand, trackLotteryCommand } from '../data/commands';
import { setupRoutes } from '../routes';
import type { StepProps } from '../shell/frame';
import { useMustDosData } from './data';
import { buildMustDos, type MustDoItem } from './model';
import { MustDosView } from './must-dos-view';
import { listWithout } from './save';

export function MustDosStep({ trip, shell }: StepProps) {
  const data = useMustDosData(trip.tripId);
  const { typing } = useTyping('trip_presence', trip.tripId);
  const setMustDos = useCommand(setMustDosCommand);
  const setStep = useCommand(setSetupStepCommand);
  const trackLottery = useCommand(trackLotteryCommand);
  const [drafting, setDrafting] = useState(false);
  const model = useMemo(
    () => buildMustDos(data.rows, data.queued, trip.members, trip.me, typing),
    [data.rows, data.queued, trip.members, trip.me, typing],
  );

  const draft = () => {
    setDrafting(true);
    void setStep
      .send({ trip_id: trip.tripId, step: 'done' })
      .then(() => {
        const href = hrefFor('3c-8', { tripId: trip.tripId });
        if (href !== undefined) router.push(href);
      })
      .finally(() => setDrafting(false));
  };

  const remind = (item: MustDoItem) => {
    if (item.pill?.kind !== 'lottery' || item.pill.closes === null) return;
    void trackLottery.send({ must_do_id: item.id, deadline: item.pill.closes });
  };

  return (
    <MustDosView
      trip={trip}
      shell={shell}
      model={model}
      canAdd={model.mine.length < MUST_DOS_PER_MEMBER}
      drafting={drafting}
      onAdd={() => router.push(setupRoutes.addMustDo(trip.tripId))}
      onDraft={draft}
      onRemove={(item) => void setMustDos.send(listWithout(trip.tripId, model.mine, item.id))}
      onRemind={remind}
    />
  );
}
