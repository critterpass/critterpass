/**
 * Home's card for a crew member who is not on the crew's trip (undesigned; logged in
 * docs/undesigned-states.md). Once a trip is confirmed or under way no proposal reaches anyone
 * new, so someone who joined the crew after it went out, or who said out, gets one way on: where
 * the crew is, and JOIN THE TRIP (`join_trip`, online: the seat is the server's to give). A seat
 * makes the card go once the participant row syncs; a full trip leaves them on the waitlist, whose
 * card (the crews sheet's own) then stands in its place.
 */

import { useLingui } from '@lingui/react/macro';

import { useCommand } from '@/data/commands/use-command';

import { toast } from '@/motion/island-toast';

import { OPEN_TRIP_SQL, OPEN_TRIP_TABLES, type OpenTripRow } from './data/home-queries';
import { useLiveRows } from './data/watch-query';
import { joinTripCommand } from './home-commands';

/** The trip the viewer could join, when their crew has one locked in without them. */
export function useOpenTrip(uid: string | null, crewId: string | null): OpenTripRow | null {
  const { rows } = useLiveRows<OpenTripRow>(
    OPEN_TRIP_SQL,
    uid === null || crewId === null ? null : [uid, crewId],
    OPEN_TRIP_TABLES,
  );
  return rows[0] ?? null;
}

interface JoinAnswer {
  readonly waitlisted?: unknown;
  readonly waitlist_position?: unknown;
}

function reasonOf(detail: unknown): string | null {
  const reason = (detail as { reason?: unknown } | null)?.reason;
  return typeof reason === 'string' ? reason : null;
}

export interface JoinTrip {
  readonly join: () => void;
  readonly pending: boolean;
}

/**
 * Taking a seat on the crew's trip (`join_trip`, online): one toast per trip says what happened,
 * whether seated, waitlisted with the place in line, the trip over, refused or offline.
 */
export function useJoinTrip(tripId: string): JoinTrip {
  const { t } = useLingui();
  const command = useCommand(joinTripCommand);
  const join = () => {
    void command.send({ trip_id: tripId }).then((sent) => {
      // One toast per trip: a second tap replaces the first answer.
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
      const id = `join-trip-${tripId}`;
      if (sent.kind === 'applied') {
        const answer = (sent.result ?? {}) as JoinAnswer;
        if (answer.waitlisted !== true) {
          toast.show({
            id,
            title: t({ id: 'home.joinTrip.joined', message: 'You’re on the trip' }),
          });
          return;
        }
        const position =
          typeof answer.waitlist_position === 'number' ? answer.waitlist_position : 1;
        toast.show({
          id,
          title: t({
            id: 'home.joinTrip.full',
            message: `The trip is full. You’re number ${position} in line for a seat.`,
          }),
        });
        return;
      }
      if (sent.kind === 'rejected' && reasonOf(sent.detail) === 'trip_closed') {
        toast.show({ id, title: t({ id: 'home.joinTrip.over', message: 'That trip is over' }) });
        return;
      }
      toast.show({
        id,
        title:
          sent.kind === 'rejected'
            ? t({ id: 'home.joinTrip.failed', message: 'Couldn’t join the trip. Try again.' })
            : t({
                id: 'home.joinTrip.offline',
                message: 'Joining needs a connection. Try again when you’re online.',
              }),
      });
    });
  };
  return { join, pending: command.pending };
}
