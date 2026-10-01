/**
 * The rooms step (3c-6), connected: the plan from synced rows with this phone's queued moves on
 * top, every move sent as `set_room_assignment` on the plan's version (queued offline), a refused
 * version re-read and the move re-applied on the latest plan, LOOKS GOOD locking the rooms (needs
 * signal), and a member's wishes and swap request.
 */
/* eslint-disable lingui/no-unlocalized-strings -- chip keys, step names and notice keys, never copy. */
import { useEffect, useRef, useState } from 'react';

import { isSkippable } from '@cp/domain';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';

import {
  lockRoomsCommand,
  requestRoomSwapCommand,
  setRoomAssignmentCommand,
  setRoomPrefsCommand,
  setSetupStepCommand,
  setStayChoiceCommand,
} from '../data/commands';
import { useCrewMoney } from '../data/crew-money';
import { useRefusedCommand } from '../data/use-refused-command';
import type { StepProps } from '../shell/frame';
import type { RoomChipKey } from './copy';
import { estimateOf, moveGuest, perPersonPrice, roomsPayload, type PlanStay } from './model';
import { fractionDigits } from './price-line';
import { useRoomsData } from './rooms-data';
import { RoomsView, type RoomsModel, type RoomsNotice } from './rooms-view';
import type { StayOption } from './stay-picker';

/** Room chips after a tap: "don't care" stands alone, at most four. */
export function toggleChip(chips: readonly RoomChipKey[], chip: RoomChipKey): RoomChipKey[] {
  if (chips.includes(chip)) return chips.filter((c) => c !== chip);
  if (chip === 'dont_care') return ['dont_care'];
  return [...chips.filter((c) => c !== 'dont_care'), chip].slice(-4);
}

export function RoomsStep({ trip, shell }: StepProps) {
  const locale = useLocale();
  const data = useRoomsData(trip.tripId, trip.me);
  const crewMoney = useCrewMoney(trip.tripId);
  // A stay picked while the answer was still on its way, and then refused by the server.
  const stayRefusal = useRefusedCommand('set_stay_choice');
  const assign = useCommand(setRoomAssignmentCommand);
  const lock = useCommand(lockRoomsCommand);
  const step = useCommand(setSetupStepCommand);
  const stay = useCommand(setStayChoiceCommand);
  const prefs = useCommand(setRoomPrefsCommand);
  const swap = useCommand(requestRoomSwapCommand);
  const [notice, setNotice] = useState<RoomsNotice>(null);
  const [swapAsked, setSwapAsked] = useState(false);
  const lastMove = useRef<{ stayKey: string; uid: string; roomKey: string } | null>(null);
  const seenConflict = useRef<string | null | undefined>(undefined);
  const reapplyAfter = useRef<number | null>(null);
  const plan = data.plan;

  const send = (moved: PlanStay, extra: { same_pairs_all_stays?: boolean } = {}) => {
    if (plan === null) return;
    void assign.send({
      trip_id: trip.tripId,
      base_version: plan.version,
      rooms: roomsPayload(moved),
      ...extra,
    });
  };

  // A refused version: say so, then re-apply the last move once the latest plan has synced.
  useEffect(() => {
    if (!data.loaded) return;
    const id = data.conflict?.id ?? null;
    if (seenConflict.current === undefined) {
      seenConflict.current = id;
      return;
    }
    if (id === null || id === seenConflict.current) return;
    seenConflict.current = id;
    setNotice('conflict');
    reapplyAfter.current = plan?.version ?? null;
  }, [data.loaded, data.conflict, plan?.version]);
  useEffect(() => {
    const move = lastMove.current;
    if (plan === null || reapplyAfter.current === null || move === null) return;
    if (plan.version === reapplyAfter.current) return;
    reapplyAfter.current = null;
    const target = plan.stays.find((candidate) => candidate.key === move.stayKey);
    const result = target === undefined ? null : moveGuest(target, move.uid, move.roomKey);
    if (result?.kind === 'moved') send(result.stay);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when a newer plan lands.
  }, [plan?.version]);

  const stays: StayOption[] = data.stays.map((row) => ({
    type: row.stay_type,
    ...estimateOf(locale, row, crewMoney),
  }));
  const currency = plan?.currency ?? null;
  const facts = {
    current: trip.step,
    crewSize: trip.members.length,
    isSolo: trip.isSolo,
    datesLocked: trip.startDate !== null,
    roomCount: plan?.stays[0]?.rooms.length ?? 0,
    stayCount: data.stays.length,
    mustDoCount: 0,
  };
  const model: RoomsModel = {
    plan,
    stays,
    stayUnavailable:
      plan !== null &&
      data.stays.length > 0 &&
      !plan.stays.every((s) => data.stays.some((row) => row.stay_type === s.type)),
    price:
      plan === null || currency === null
        ? null
        : perPersonPrice(plan, trip.me, fractionDigits(currency)),
    currency,
    skippable: isSkippable('rooms', facts),
    notice:
      notice ??
      (stayRefusal.refused
        ? stayRefusal.reason === 'stay_unavailable'
          ? 'stay_unavailable'
          : 'stay_failed'
        : null),
    myChips: data.myChips,
    swapAsked: swapAsked || data.swapQueued,
    locking: lock.pending,
  };

  return (
    <RoomsView
      trip={trip}
      shell={shell}
      model={model}
      actions={{
        onMove: (moved, { uid, roomKey }) => {
          lastMove.current = { stayKey: moved.key, uid, roomKey };
          setNotice(null);
          send(moved);
        },
        onSeparate: (stayKey, separate) => {
          const target = plan?.stays.find((candidate) => candidate.key === stayKey);
          if (target !== undefined) send(target, { same_pairs_all_stays: !separate });
        },
        onPickStay: (type) => {
          setNotice(null);
          stayRefusal.acknowledge();
          void stay.send({ trip_id: trip.tripId, stay_option_id: type }).then((result) => {
            if (result.kind === 'rejected') setNotice('stay_failed');
          });
        },
        onLock: () => {
          void lock.send({ trip_id: trip.tripId }).then((result) => {
            if (result.kind === 'applied') shell.onSelectStep('must_dos');
            else setNotice(result.kind === 'unavailable' ? 'lock_offline' : 'lock_failed');
          });
        },
        onSkip: () => {
          void step.send({ trip_id: trip.tripId, step: 'must_dos' });
          shell.onSelectStep('must_dos');
        },
        onToggleChip: (chip) => {
          void prefs.send({ trip_id: trip.tripId, chips: toggleChip(data.myChips, chip) });
        },
        onAskSwap: () => {
          setSwapAsked(true);
          void swap.send({ trip_id: trip.tripId });
        },
      }}
    />
  );
}
