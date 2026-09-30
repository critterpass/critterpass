/**
 * The dates step, connected: counts and options from synced rows, this person's own calendar
 * (device sync, OAuth, or days by hand), and the organiser's actions — lock a window
 * (`lock_trip_dates`, needs signal; setup moves on to the budget) or ask the blocker privately
 * (`ask_availability`, queued offline; the organiser only ever learns the outcome).
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire codes, never copy. */
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { CalendarConnectSheet } from '../calendar/calendar-connect-sheet';
import { ManualDaysSheet } from '../calendar/manual-days-sheet';
import { syncRange } from '../calendar/sync-plan';
import { useCalendarSync } from '../calendar/use-calendar-sync';
import { askAvailabilityCommand, lockTripDatesCommand } from '../data/commands';
import { useSetupServices } from '../data/services';
import { setupRoutes } from '../routes';
import type { StepProps } from '../shell/frame';
import { guideName } from '../shell/guide-note';
import {
  crewSize,
  heatMonths,
  initialMonth,
  syncedCount,
  whenMode,
  type WindowOption,
} from './model';
import { useWhenData } from './use-when-data';
import { WeekPicker } from './week-picker';
import { useUnsyncedMembers } from './use-unsynced';
import { WhenView, type WhenFailure } from './when-view';

type Overlay = 'calendar' | 'manual' | 'picker' | null;

const DEFAULT_LENGTH_DAYS = 7;

function failureOf(code: string): WhenFailure {
  if (code === 'NETWORK' || code.startsWith('HTTP_')) return 'offline';
  if (code === 'RATE_LIMITED') return 'rate';
  return 'generic';
}

export function WhenStep({ trip, shell }: StepProps) {
  const services = useSetupServices();
  const data = useWhenData(trip.tripId);
  const calendar = useCalendarSync(trip.tripId);
  const lock = useCommand(lockTripDatesCommand);
  const ask = useCommand(askAvailabilityCommand);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const unsynced = useUnsyncedMembers(trip.tripId, services);
  const [chosen, setChosen] = useState<string | null>(null);
  const [failure, setFailure] = useState<WhenFailure | null>(null);

  const months = heatMonths(data.summaries);
  const total = crewSize(data.summaries, trip.members.length);
  const synced = syncedCount(data.summaries);
  const mode = whenMode(data.options, synced);
  const best = data.options.find((option) => option.kind === 'best') ?? null;
  const noFit = mode === 'no_fit' ? data.options.filter((option) => option.kind !== 'best') : [];
  const pick = noFit.find((option) => option.isPick) ?? noFit[0];
  const selectedId = chosen ?? pick?.id ?? null;
  const startMonth = initialMonth(months, best);
  // The picker spans the whole horizon, so the organiser can pick a week before anyone has shared.
  const pickerMonths = heatMonths(
    data.summaries,
    syncRange(new Date(services.now()), Intl.DateTimeFormat().resolvedOptions().timeZone),
  );

  const onLock = (start: string, end: string) => {
    setFailure(null);
    void lock.send({ trip_id: trip.tripId, start, end }).then((sent) => {
      if (sent.kind === 'applied') {
        setOverlay(null);
        router.replace(setupRoutes.step(trip.tripId, 'budget'));
      } else if (sent.kind === 'rejected' || sent.kind === 'unavailable') {
        setFailure(failureOf(sent.code));
      }
    });
  };

  const onAsk = (option: WindowOption) => {
    if (option.askUserId === null) return;
    setFailure(null);
    void ask
      .send({
        trip_id: trip.tripId,
        target_uid: option.askUserId,
        range: { start: option.start, end: option.end },
        option_id: option.id,
      })
      .then((sent) => {
        if (sent.kind === 'rejected') setFailure(failureOf(sent.code));
      });
  };

  return (
    <>
      <WhenView
        shell={shell}
        model={{
          isOrganiser: trip.isOrganiser,
          mode,
          place: trip.destinationName,
          guide: trip.guide,
          guideName: guideName(trip.guide),
          score: trip.score,
          members: trip.members,
          total,
          synced,
          unsyncedNames: trip.members
            .filter((member) => unsynced.includes(member.uid))
            .map((member) => member.name),
          months,
          startMonth,
          best,
          options: noFit,
          selectedId,
          mustDoTitles: data.mustDoTitles,
          calendar: { status: calendar.status, lastSyncedAt: calendar.lastSyncedAt },
          now: new Date(services.now()),
          busy: lock.pending || ask.pending,
          failure,
        }}
        actions={{
          onSelect: setChosen,
          onLock,
          onAsk,
          onPickWeek: () => setOverlay('picker'),
          onConnect: () => setOverlay('calendar'),
          onMarkByHand: () => setOverlay('manual'),
        }}
      />
      {overlay === 'calendar' ? (
        <CalendarConnectSheet
          tripId={trip.tripId}
          onDismiss={() => setOverlay(null)}
          onMarkByHand={() => setOverlay('manual')}
        />
      ) : null}
      {overlay === 'manual' ? (
        <ManualDaysSheet tripId={trip.tripId} onDismiss={() => setOverlay(null)} />
      ) : null}
      {overlay === 'picker' ? (
        <WeekPicker
          months={pickerMonths}
          startMonth={initialMonth(pickerMonths, best)}
          total={total}
          lengthDays={trip.lengthDays ?? DEFAULT_LENGTH_DAYS}
          busy={lock.pending}
          onLock={onLock}
          onDismiss={() => setOverlay(null)}
        />
      ) : null}
    </>
  );
}
