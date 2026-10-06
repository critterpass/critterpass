/**
 * The must-dos step wired to the phone: synced must-dos plus this phone's queued list, crewmates
 * typing on `trip_presence`, removing your own (queued, works offline), lottery reminders, and
 * the organiser's "Draft my trip", which finishes setup and opens the drafting screen, which
 * starts the draft. After that the step keeps one button for the organiser, read from the trip's
 * synced status: the drafting wait while the draft is written, the draft once it is ready.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command values, route ids and date options, never copy. */
import { MUST_DOS_PER_MEMBER } from '@cp/domain';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTyping } from '@/data/realtime/use-typing';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { useLocale } from '@/lib/i18n/use-locale';

import { setMustDosCommand, setSetupStepCommand, trackLotteryCommand } from '../data/commands';
import { setupRoutes } from '../routes';
import type { StepProps } from '../shell/frame';
import { useMustDosData } from './data';
import { buildMustDos, type MustDoItem } from './model';
import { MustDosView } from './must-dos-view';
import { useExamplePlaces } from './examples';
import { listWith, listWithout } from './save';

export function MustDosStep({ trip, shell }: StepProps) {
  const data = useMustDosData(trip.tripId);
  const { typing } = useTyping('trip_presence', trip.tripId);
  const setMustDos = useCommand(setMustDosCommand);
  const setStep = useCommand(setSetupStepCommand);
  const trackLottery = useCommand(trackLotteryCommand);
  const [drafting, setDrafting] = useState(false);
  const examples = useExamplePlaces(data.destinationId, useLocale());
  const model = useMemo(
    () => buildMustDos(data.rows, data.queued, trip.members, trip.me, typing),
    [data.rows, data.queued, trip.members, trip.me, typing],
  );

  const draft = (withoutMustDos = false) => {
    setDrafting(true);
    void setStep
      .send({
        trip_id: trip.tripId,
        step: 'done',
        ...(withoutMustDos ? { without_must_dos: true as const } : {}),
      })
      .then(() => {
        const href = hrefFor('3c-8', { tripId: trip.tripId });
        if (href !== undefined) router.push(href);
      })
      .finally(() => setDrafting(false));
  };

  // Coming back here from the wait (or later, from Home) must lead on, never dead-end.
  const draftState =
    trip.step !== 'done' || !trip.isOrganiser
      ? null
      : trip.status === 'draft_review' || trip.status === 'redrafting'
        ? 'ready'
        : trip.status === 'setup' || trip.status === 'drafting'
          ? 'writing'
          : null;
  const openDraft = () => {
    const href = hrefFor(draftState === 'ready' ? '3c-9' : '3c-8', { tripId: trip.tripId });
    if (href !== undefined) router.push(href);
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
      draft={draftState}
      onOpenDraft={openDraft}
      onAdd={() => router.push(setupRoutes.addMustDo(trip.tripId))}
      onDraft={() => draft()}
      onDraftWithout={() => draft(true)}
      examples={examples}
      onExample={(place) => {
        const list = listWith(trip.tripId, model.mine, { text: place.name, poiId: place.id });
        if (list !== null) void setMustDos.send(list);
      }}
      onRemove={(item) => void setMustDos.send(listWithout(trip.tripId, model.mine, item.id))}
      onRemind={remind}
    />
  );
}
