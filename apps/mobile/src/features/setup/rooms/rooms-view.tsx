/**
 * The rooms step (3c-6) as a pure view: the organiser's plan with drag and tap-to-move, the
 * per-person price in the guide's voice, LOOKS GOOD; a member's read-only plan with their own room
 * ringed, their room wishes and "Ask to swap"; and the states around it (no dates yet, picking
 * the stay, the stay gone, waiting for the organiser, a skippable one-room trip).
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { SetupMember } from '../data/setup-trip';
import type { StepProps } from '../shell/frame';
import { DoneTag } from '../shell/header-tag';
import { SetupShell } from '../shell/setup-shell';
import { memberLine, organiserLine } from './copy';
import { traitsOf, type PerPerson, type PlanStay, type RoomsPlan } from './model';
import { PriceLine } from './price-line';
import { MemberRoomTools, MemberSwapAction, type RoomChipKey } from './member-tools';
import { RoomsPlanCards } from './rooms-plan';
import { StayPicker, type StayOption } from './stay-picker';

export type RoomsNotice =
  'conflict' | 'lock_offline' | 'lock_failed' | 'stay_failed' | 'stay_unavailable' | null;

export interface RoomsModel {
  readonly plan: RoomsPlan | null;
  readonly stays: readonly StayOption[];
  /** The chosen stay type is no longer offered (re-pick). */
  readonly stayUnavailable: boolean;
  readonly price: PerPerson | null;
  readonly currency: string | null;
  readonly skippable: boolean;
  readonly notice: RoomsNotice;
  readonly myChips: readonly RoomChipKey[];
  readonly swapAsked: boolean;
  readonly locking: boolean;
}

export interface RoomsActions {
  readonly onMove: (stay: PlanStay, moved: { uid: string; roomKey: string }) => void;
  readonly onSeparate: (stayKey: string, separate: boolean) => void;
  readonly onPickStay: (type: string) => void;
  readonly onLock: () => void;
  readonly onSkip: () => void;
  readonly onToggleChip: (chip: RoomChipKey) => void;
  readonly onAskSwap: () => void;
}

function noticeText(notice: RoomsNotice): string | null {
  switch (notice) {
    case 'conflict':
      return t({
        id: 'setup.rooms.notice.conflict',
        message: 'Someone else just moved people. Here’s the latest.',
      });
    case 'lock_offline':
      return t({ id: 'setup.rooms.notice.offline', message: 'Locking the rooms needs signal.' });
    case 'lock_failed':
      return t({
        id: 'setup.rooms.notice.lockFailed',
        message: 'That didn’t lock. Pick a stay and try again.',
      });
    case 'stay_failed':
      return t({
        id: 'setup.rooms.notice.stayFailed',
        message: 'That stay didn’t go through. Check the dates are locked and try again.',
      });
    case 'stay_unavailable':
      return t({
        id: 'setup.rooms.notice.stayUnavailable',
        message:
          'That stay has no price for this trip right now, so it wasn’t picked. Try another.',
      });
    case null:
      return null;
  }
}

export function RoomsView({
  trip,
  shell,
  model,
  actions,
  initialReject,
}: StepProps & {
  readonly model: RoomsModel;
  readonly actions: RoomsActions;
  readonly initialReject?: { readonly stayKey: string; readonly roomKey: string } | undefined;
}) {
  const theme = useTheme();
  const guide = GUIDE_STICKERS[trip.guide].name;
  const organiser: SetupMember | undefined = trip.members.find((member) => member.organiser);
  const people = new Map(trip.members.map((member) => [member.uid, member]));
  const plan = model.plan;
  const title = t({ id: 'setup.rooms.title', message: 'Who sleeps where?' });
  const editable = trip.isOrganiser;

  let line: string;
  let body: ReactNode;
  if (trip.startDate === null) {
    line = t({
      id: 'setup.rooms.noDates',
      message: 'Rooms come once the dates are locked, so the nights add up.',
    });
    body = null;
  } else if (plan === null || model.stayUnavailable) {
    line = editable
      ? model.stayUnavailable
        ? t({
            id: 'setup.rooms.stayGone',
            message: 'That stay isn’t on offer for these dates any more. Pick another.',
          })
        : t({
            id: 'setup.rooms.pickStay',
            message: `Pick where you’ll stay and ${guide} splits the rooms.`,
          })
      : t({
          id: 'setup.rooms.waitingStay',
          message: `${organiser?.name ?? ''} is picking the stay. The rooms show up here.`,
        });
    body = editable ? <StayPicker stays={model.stays} onPick={actions.onPickStay} /> : null;
  } else {
    line = editable ? organiserLine(guide, traitsOf(plan)) : memberLine(organiser?.name ?? '');
    body = (
      <RoomsPlanCards
        plan={plan}
        people={people}
        memberIds={trip.members.map((member) => member.uid)}
        me={trip.me}
        tripStart={trip.startDate}
        editable={editable}
        onMove={actions.onMove}
        onSeparate={actions.onSeparate}
        initialReject={initialReject}
      />
    );
  }
  const notice = noticeText(model.notice);
  // With no rooms to lock and a step that may be skipped, the even split is the plan: LOOKS GOOD
  // accepts it (the same move as Skip rooms, which it then stands in for).
  const acceptsEvenSplit = plan === null && model.skippable;

  const footer = editable ? (
    <>
      <PillButton
        label={t({ id: 'setup.rooms.lock', message: 'Looks good' })}
        onPress={acceptsEvenSplit ? actions.onSkip : actions.onLock}
        disabled={!acceptsEvenSplit && (plan === null || model.stayUnavailable)}
        loading={model.locking}
        block
        testID="setup-rooms-lock"
      />
      {model.skippable && !acceptsEvenSplit ? (
        <TextLink
          label={t({ id: 'setup.rooms.skip', message: 'Skip rooms' })}
          onPress={actions.onSkip}
          testID="setup-rooms-skip"
        />
      ) : null}
    </>
  ) : plan !== null && trip.startDate !== null ? (
    <MemberSwapAction
      swapAsked={model.swapAsked}
      organiser={organiser?.name ?? ''}
      onAskSwap={actions.onAskSwap}
    />
  ) : undefined;

  return (
    <SetupShell
      {...shell}
      tag={<DoneTag label={t({ id: 'setup.rooms.tag', message: 'Budget' })} />}
      title={title}
      line={line}
      footer={footer}
      testID="setup-rooms"
    >
      {body}
      {model.skippable && editable ? (
        <Text variant="bodySm" color={theme.semantic.text.secondary} testID="setup-rooms-even">
          {t({
            id: 'setup.rooms.evenSplit',
            message: 'One room for everyone, so the stay splits evenly. You can skip this step.',
          })}
        </Text>
      ) : null}
      {plan !== null && model.price !== null && model.currency !== null ? (
        <PriceLine
          guide={trip.guide}
          price={model.price}
          currency={model.currency}
          member={!editable}
        />
      ) : null}
      {notice === null ? null : (
        <Text variant="bodySm" color={theme.semantic.state.warning} testID="setup-rooms-notice">
          {notice}
        </Text>
      )}
      {!editable && trip.startDate !== null ? (
        <MemberRoomTools chips={model.myChips} onToggleChip={actions.onToggleChip} />
      ) : null}
    </SetupShell>
  );
}
