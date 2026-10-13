/** The crew's locked-in trip for a member not on it: where it stands and the way on. */
import { useLingui } from '@lingui/react/macro';

import { Button, Card, Text } from '@/ui/premium';

import type { OpenTripRow } from '../data/home-queries';
import { useJoinTrip } from '../join-trip';

export function JoinTripNote({
  trip,
  crewName,
}: {
  readonly trip: OpenTripRow;
  readonly crewName: string;
}) {
  const { t } = useLingui();
  const join = useJoinTrip(trip.id);
  const place = trip.destination_name;
  const underWay = trip.status === 'in_trip';
  const title =
    place === null
      ? underWay
        ? t({ id: 'home.joinTrip.titleNow', message: `${crewName} is on a trip right now.` })
        : t({ id: 'home.joinTrip.titleSoon', message: `${crewName} has a trip locked in.` })
      : underWay
        ? t({ id: 'home.joinTrip.titleNowPlace', message: `${crewName} is in ${place} right now.` })
        : t({ id: 'home.joinTrip.titleSoonPlace', message: `${crewName} is going to ${place}.` });
  return (
    <Card radius={22} style={{ padding: 16, gap: 10 }} testID="home-join-trip">
      <Text variant="headline">{title}</Text>
      <Text variant="note" tone="muted">
        {t({
          id: 'home.joinTrip.body',
          message:
            'You’re in the crew, not on this trip yet. Join to be in the plan and the splits.',
        })}
      </Text>
      <Button
        label={t({ id: 'home.joinTrip.cta', message: 'Join the trip' })}
        size="medium"
        loading={join.pending}
        onPress={join.join}
        testID="home-join-trip-cta"
      />
    </Card>
  );
}
