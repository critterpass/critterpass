/**
 * The rooms step (3c-6), connected: the plan from synced rows with this phone's queued moves on
 * top, every move sent as `set_room_assignment` on the plan's version (queued offline), a refused
 * version re-read and the move re-applied on the latest plan, LOOKS GOOD locking the rooms (needs
 * signal), and a member's wishes and swap request. When setup arrives here with nothing to decide
 * (no stay on offer, no rooms to split, a step the server lets pass), the organiser is taken
 * straight on to the must-dos; the step stays in the stepper to open later.
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

/**
 * Trips already taken past an empty rooms step in this session: a move the server refuses brings
 * setup back here, and it must then stay rather than leave again.
 */
const passedEmpty = new Set<string>();

/** Whether the rooms step has nothing for the organiser to decide right now. */
export function nothingToDecide(input: {
  readonly loaded: boolean;
  readonly isOrganiser: boolean;
  readonly onRooms: boolean;
  readonly hasPlan: boolean;
  readonly stayCount: number;
  readonly skippable: boolean;
}): boolean {
  return (
    input.loaded &&
    input.isOrganiser &&
    input.onRooms &&
    !input.hasPlan &&
    input.stayCount === 0 &&
    input.skippable
  );
}

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
  // A step move the server refused: setup was brought back here and must stay.
  const stepRefusal = useRefusedCommand('set_setup_step');
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
  const skippable = isSkippable('rooms', facts);
  const empty = nothingToDecide({
    loaded: data.loaded,
    isOrganiser: trip.isOrganiser,
    onRooms: trip.step === 'rooms',
    hasPlan: plan !== null,
    stayCount: data.stays.length,
    skippable,
  });
  // Decided once per mount: whether this visit passes straight through.
  const [passing] = useState(() => !passedEmpty.has(trip.tripId));
  const pass = passing && empty && stepRefusal.loaded && !stepRefusal.refused;
  useEffect(() => {
    if (!pass) return;
    passedEmpty.add(trip.tripId);
    void step.send({ trip_id: trip.tripId, step: 'must_dos' });
    shell.onSelectStep('must_dos');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the step turns out empty.
  }, [pass]);
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
    skippable,
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

  // Nothing to show on the way past: the must-dos step is already opening.
  if (pass) return null;
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
