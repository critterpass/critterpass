/**
 * The one way to end this trip the reader may take, for any menu: an organiser deletes a trip still
 * being set up that nobody else is on, or calls any other trip off before it starts; a member
 * leaves. The confirm runs the command and says how it went; a deleted or left trip sends the
 * reader back to the trip list.
 */
import { tripRemovals, type TripRemoval } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useContext, useState } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { toast } from '@/motion/island-toast';

import { useLiveRows } from './data/live-rows';
import { TRIPS_TAB } from './routes';
import { CANCEL_TRIP, DELETE_TRIP, LEAVE_TRIP } from './trip-commands';

/* eslint-disable lingui/no-unlocalized-strings -- SQL, table names and toast ids, never copy. */
const OTHERS_SQL = `SELECT count(*) AS n FROM trip_participants
  WHERE trip_id = ? AND user_id <> ? AND rsvp <> 'out'`;
const OTHERS_TABLES = ['trip_participants'];
const failedToastId = (tripId: string) => `trip-menu-failed-${tripId}`;
const doneToastId = (tripId: string) => `trip-menu-done-${tripId}`;
/* eslint-enable lingui/no-unlocalized-strings */

export interface RemovalCopy {
  readonly link: string;
  readonly title: string;
  readonly lines: readonly string[];
  readonly confirm: string;
}

export function removalCopy(removal: TripRemoval): RemovalCopy {
  if (removal === 'delete') {
    return {
      link: t({ id: 'trip.menu.delete', message: 'Delete trip' }),
      title: t({ id: 'trip.menu.deleteTitle', message: 'Delete this trip?' }),
      lines: [
        t({
          id: 'trip.menu.deleteGone',
          message: 'Nobody else is on it yet, so it goes for good: dates, ideas and any draft.',
        }),
        t({ id: 'trip.menu.deleteCrew', message: 'Your crew and its chat stay.' }),
      ],
      confirm: t({ id: 'trip.menu.deleteConfirm', message: 'Delete trip' }),
    };
  }
  if (removal === 'cancel') {
    return {
      link: t({ id: 'trip.menu.cancel', message: 'Call off trip' }),
      title: t({ id: 'trip.menu.cancelTitle', message: 'Call off this trip?' }),
      lines: [
        t({ id: 'trip.menu.cancelTold', message: 'Everyone on it gets told.' }),
        t({
          id: 'trip.menu.cancelKept',
          message: 'The chat, money, bookings and photos stay to read.',
        }),
        t({
          id: 'trip.menu.cancelBoost',
          message: 'Open votes close. A boost moves to your next trip, or comes back as a credit.',
        }),
      ],
      confirm: t({ id: 'trip.menu.cancelConfirm', message: 'Call off trip' }),
    };
  }
  return {
    link: t({ id: 'trip.menu.leave', message: 'Leave trip' }),
    title: t({ id: 'trip.menu.leaveTitle', message: 'Leave this trip?' }),
    lines: [
      t({ id: 'trip.menu.leaveSeat', message: 'Your seat opens for the next person waiting.' }),
      t({
        id: 'trip.menu.leaveMoney',
        message: 'Shared costs are split again without you.',
      }),
    ],
    confirm: t({ id: 'trip.menu.leaveConfirm', message: 'Leave trip' }),
  };
}

/** What the reader is told once it went through: the sheet closing alone says nothing. */
function doneLine(removal: TripRemoval): string {
  if (removal === 'delete') return t({ id: 'trip.menu.deleted', message: 'Trip deleted' });
  if (removal === 'cancel') {
    return t({ id: 'trip.menu.cancelled', message: 'Trip called off. Everyone on it was told.' });
  }
  return t({ id: 'trip.menu.left', message: 'You left the trip' });
}

function failedToast(tripId: string, code: string | null): void {
  toast.show({
    id: failedToastId(tripId),
    title:
      code === 'STATE_INVALID'
        ? t({
            id: 'trip.menu.stateChanged',
            message: 'The trip changed since you opened it. Have another look.',
          })
        : t({ id: 'trip.menu.failed', message: 'That didn’t go through. Try again with signal.' }),
  });
}

export interface TripMenuProps {
  readonly tripId: string;
  readonly status: string;
  readonly role: string | null;
  readonly me: string | null;
}

export type TripRemovalState =
  | { readonly kind: 'none' }
  | { readonly kind: 'cancelled' }
  | {
      readonly kind: 'ready';
      readonly removal: TripRemoval;
      readonly copy: RemovalCopy;
      readonly busy: boolean;
      /** Runs it; `onSettled` fires once it went through or failed (close the confirm then). */
      readonly confirm: (onSettled: () => void) => void;
    };

export function useTripRemoval({ tripId, status, role, me }: TripMenuProps): TripRemovalState {
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  const [busy, setBusy] = useState(false);
  const others = useLiveRows<{ n: number }>(
    OTHERS_SQL,
    me === null ? null : [tripId, me],
    OTHERS_TABLES,
  );
  if (status === 'cancelled') return { kind: 'cancelled' };
  if (role === null || commands === null || !others.loaded) return { kind: 'none' };
  const [removal] = tripRemovals({
    status,
    organiser: role === 'organiser',
    othersOnTrip: others.rows[0]?.n ?? 0,
  });
  if (removal === undefined) return { kind: 'none' };
  return {
    kind: 'ready',
    removal,
    copy: removalCopy(removal),
    busy,
    confirm: (onSettled) => {
      if (busy) return;
      setBusy(true);
      const spec =
        removal === 'delete' ? DELETE_TRIP : removal === 'cancel' ? CANCEL_TRIP : LEAVE_TRIP;
      void commands.send(spec, { trip_id: tripId }).then((sent) => {
        setBusy(false);
        onSettled();
        if (sent.kind !== 'applied') {
          failedToast(tripId, sent.kind === 'rejected' ? sent.code : null);
          return;
        }
        toast.show({ id: doneToastId(tripId), title: doneLine(removal) });
        // A deleted or left trip is no longer the reader's to look at: back to the trip list.
        if (removal !== 'cancel') router.navigate(TRIPS_TAB);
      });
    },
  };
}
