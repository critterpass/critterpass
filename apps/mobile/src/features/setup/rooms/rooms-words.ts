/**
 * What the rooms step says and shows, for every look: the title (a stay pick for a trip of one),
 * the phase (no dates yet, picking the stay, waiting on the organiser, the plan, or no stay on
 * offer at all), the guide's line for it, whether LOOKS GOOD takes the even split, and what went
 * wrong in words.
 */
import { t } from '@lingui/core/macro';

import { guideSticker } from '@/ui/avatar/guides';

import type { SetupTrip } from '../data/setup-trip';
import { memberLine, organiserLine } from './copy';
import { traitsOf } from './model';
import type { RoomsModel, RoomsNotice } from './rooms-view';

export type RoomsPhase = 'no_dates' | 'pick_stay' | 'waiting_stay' | 'plan' | 'no_stays';

export interface RoomsWords {
  readonly title: string;
  readonly line: string;
  readonly phase: RoomsPhase;
  readonly solo: boolean;
  readonly editable: boolean;
  readonly organiserName: string;
  /** No rooms to lock on a step that may be skipped: LOOKS GOOD accepts the even split. */
  readonly acceptsEvenSplit: boolean;
  readonly notice: string | null;
}

export function noticeText(notice: RoomsNotice): string | null {
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

export function roomsWords(trip: SetupTrip, model: RoomsModel): RoomsWords {
  const guide = guideSticker(trip.guide).name;
  const organiser = trip.members.find((member) => member.organiser);
  const organiserName = organiser?.name ?? '';
  const plan = model.plan;
  // A trip for one has no rooms to share out: the step is where the stay is picked.
  const solo = trip.isSolo || trip.members.length < 2;
  const editable = trip.isOrganiser;
  const title = solo
    ? t({ id: 'setup.rooms.titleSolo', message: 'Where will you stay?' })
    : t({ id: 'setup.rooms.title', message: 'Who sleeps where?' });
  const acceptsEvenSplit = plan === null && model.skippable;
  const base = { title, solo, editable, organiserName, acceptsEvenSplit };
  const notice = noticeText(model.notice);
  if (trip.startDate === null) {
    return {
      ...base,
      notice,
      phase: 'no_dates',
      line: t({
        id: 'setup.rooms.noDates',
        message: 'Rooms come once the dates are locked, so the nights add up.',
      }),
    };
  }
  // No stay on offer to pick: the rooms come with a stay and the even split stands until then.
  if (editable && acceptsEvenSplit && !model.stayUnavailable && model.stays.length === 0) {
    return {
      ...base,
      notice,
      phase: 'no_stays',
      line: t({
        id: 'setup.rooms.evenSplit',
        message: 'One room for everyone, so the stay splits evenly. You can skip this step.',
      }),
    };
  }
  if (plan === null || model.stayUnavailable) {
    if (!editable) {
      return {
        ...base,
        notice,
        phase: 'waiting_stay',
        line: t({
          id: 'setup.rooms.waitingStay',
          message: `${organiser?.name ?? ''} is picking the stay. The rooms show up here.`,
        }),
      };
    }
    return {
      ...base,
      notice,
      phase: 'pick_stay',
      line: model.stayUnavailable
        ? t({
            id: 'setup.rooms.stayGone',
            message: 'That stay isn’t on offer for these dates any more. Pick another.',
          })
        : solo
          ? t({
              id: 'setup.rooms.pickStaySolo',
              message: 'Pick the kind of place you’d like. It sets what the stay costs.',
            })
          : t({
              id: 'setup.rooms.pickStay',
              message: `Pick where you’ll stay and ${guide} splits the rooms.`,
            }),
    };
  }
  return {
    ...base,
    notice,
    phase: 'plan',
    line: solo
      ? t({ id: 'setup.rooms.line.solo', message: 'That’s your stay for the trip.' })
      : editable
        ? organiserLine(guide, traitsOf(plan))
        : memberLine(organiserName),
  };
}
