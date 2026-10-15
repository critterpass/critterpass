/**
 * Your ride back on Getting around, in the card style of 6.19: who and when, the car and plate, the
 * pickup spot, Call (signal, not data) and WhatsApp (sent once back online), then what is saved on
 * the phone so it all works with no data. Nothing shows on a day no driver is set.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { crewAccent, IconTile } from '@/features/trip';
import { Avatar, Button, Card, ListCard, Row, Text, usePremiumTheme } from '@/ui/premium';

import { useRideBack } from '../offline/use-ride-back';

export function RideBackCardPremium({
  tripId,
  date,
}: {
  readonly tripId: string;
  readonly date: string;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const ride = useRideBack(tripId, date);
  if (ride === null) return null;
  const { name } = ride;
  return (
    <View style={{ gap: th.space.gap8 }} testID="drivers-ride-back">
      <Text variant="headline" accessibilityRole="header">
        {t({ id: 'drivers.offline.title', message: 'Your ride back' })}
      </Text>
      <Card radius={th.radius.cardRow} style={[styles.card, { gap: th.space.gap12 }]}>
        <View style={styles.row}>
          <Avatar name={name} color={crewAccent(2)} size={48} />
          <View style={styles.flex}>
            <Text variant="rowTitle">{ride.at === null ? name : `${name} · ${ride.at}`}</Text>
            {ride.vehicle === null ? null : (
              <Text variant="caption" tone="muted">
                {ride.vehicle}
              </Text>
            )}
          </View>
        </View>
        {ride.pickup === null ? null : (
          <View style={styles.row}>
            <IconTile
              name="map"
              bg={th.color.status.maybe.bg}
              color={th.color.status.maybe.text}
              size={32}
            />
            <Text variant="rowText" style={styles.flex}>
              {ride.pickup}
            </Text>
          </View>
        )}
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button
              label={t({ id: 'drivers.offline.call', message: 'Call' })}
              size="small"
              disabled={ride.onCall === null}
              onPress={() => ride.onCall?.()}
              testID="drivers-ride-back-call"
            />
          </View>
          <View style={styles.flex}>
            <Button
              label={
                ride.online
                  ? t({ id: 'drivers.offline.whatsapp', message: 'WhatsApp' })
                  : t({ id: 'drivers.offline.whatsappLater', message: 'WhatsApp · later' })
              }
              size="small"
              variant="control"
              disabled={ride.onWhatsApp === null}
              onPress={() => ride.onWhatsApp?.()}
              testID="drivers-ride-back-whatsapp"
            />
          </View>
        </View>
        <Text variant="captionMuted" tone="muted">
          {t({
            id: 'drivers.offline.note',
            message: 'Calls use signal, not data. The message sends when you’re back online.',
          })}
        </Text>
      </Card>
      <Text variant="captionMuted" tone="muted">
        {t({ id: 'drivers.offline.saved', message: 'Saved on your phone' })}
      </Text>
      <ListCard radius={th.radius.cardRow}>
        <Row
          title={t({
            id: 'drivers.offline.savedNumber',
            message: `${name}’s number, car and plate`,
          })}
        />
        <Row
          title={t({ id: 'drivers.offline.savedPickups', message: 'Today’s pickups and pins' })}
        />
        {ride.terms === '' ? null : (
          <Row
            title={t({ id: 'drivers.offline.savedTerms', message: 'What you agreed' })}
            subtitle={ride.terms}
          />
        )}
      </ListCard>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14 },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
