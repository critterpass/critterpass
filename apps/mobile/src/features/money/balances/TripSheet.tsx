/** Picks which of the crew's trips Money shows (undesigned; a crew can have several trips). */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Sheet } from '@/ui/sheet/Sheet';
import { makeStyles } from '@/ui/theme';

import type { MoneyTrip } from '../data/context';

const useStyles = makeStyles((t) => ({ body: { padding: t.space['16'] } }));

export function tripLabel(trip: MoneyTrip, fallback: string): string {
  const name = trip.destinationName ?? fallback;
  return trip.startDate === null ? name : `${name} · ${trip.startDate.slice(0, 7)}`;
}

export function TripSheet({
  trips,
  current,
  onPick,
  onClose,
}: {
  readonly trips: readonly MoneyTrip[];
  readonly current: string;
  readonly onPick: (tripId: string) => void;
  readonly onClose: () => void;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  const title = t({ id: 'money.trips.title', message: 'Which trip?' });
  const fallback = t({ id: 'money.trips.unnamed', message: 'Trip' });
  return (
    <Sheet
      detents={['fit']}
      title={title}
      onDismiss={onClose}
      accessibilityLabel={title}
      testID="money-trips"
    >
      <View style={styles.body}>
        <SettingsGroup
          rows={trips.map((trip) => ({
            key: trip.id,
            kind: 'check' as const,
            title: tripLabel(trip, fallback),
            checked: trip.id === current,
            onPress: () => onPick(trip.id),
          }))}
        />
      </View>
    </Sheet>
  );
}
