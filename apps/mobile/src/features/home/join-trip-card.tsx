/**
 * Home's card for a crew member who is not on the crew's trip (undesigned; logged in
 * docs/undesigned-states.md). Once a trip is confirmed or under way no proposal reaches anyone
 * new, so someone who joined the crew after it went out, or who said out, gets one way on: where
 * the crew is, and JOIN THE TRIP (`join_trip`, online: the seat is the server's to give). A seat
 * makes the card go once the participant row syncs; a full trip leaves them on the waitlist, whose
 * card (the crews sheet's own) then stands in its place.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

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

export interface JoinTripCardProps {
  readonly trip: OpenTripRow;
  readonly crewName: string;
}

export function JoinTripCard({ trip, crewName }: JoinTripCardProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const theme = useTheme();
  const join = useCommand(joinTripCommand);
  const place = trip.destination_name;
  const underWay = trip.status === 'in_trip';
  const title =
    place === null
      ? underWay
        ? t({ id: 'home.joinTrip.titleNow', message: `${crewName} is on a trip right now.` })
        : t({ id: 'home.joinTrip.titleSoon', message: `${crewName} has a trip locked in.` })
      : underWay
        ? t({
            id: 'home.joinTrip.titleNowPlace',
            message: `${crewName} is in ${place} right now.`,
          })
        : t({
            id: 'home.joinTrip.titleSoonPlace',
            message: `${crewName} is going to ${place}.`,
          });

  const onJoin = () => {
    void join.send({ trip_id: trip.id }).then((sent) => {
      // One toast per trip: a second tap replaces the first answer.
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
      const id = `join-trip-${trip.id}`;
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

  return (
    <Card testID="home-join-trip">
      <Stack gap="12">
        <Text variant="h3" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'home.joinTrip.body',
            message:
              'You’re in the crew, not on this trip yet. Join to be in the plan and the splits.',
          })}
        </Text>
        <PillButton
          label={upper(t({ id: 'home.joinTrip.cta', message: 'Join the trip' }), locale)}
          onPress={onJoin}
          loading={join.pending}
          block
          testID="home-join-trip-cta"
        />
      </Stack>
    </Card>
  );
}
