/**
 * Private tours (6.21): a car with a driver from Klook or Viator, fixed price, booked and paid
 * with the supplier. Each tour card carries the supplier's own title and price, word for word,
 * with Add to compare (ink) and Open on the supplier (control). A partner without cards for the
 * trip is a compact card linking to its own search. The commission line sits at the bottom.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DisclosurePremium } from '@/features/bookings';
import { IconTile } from '@/features/trip';
import { Button, LoadingCritter, Text, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { usePrivateTours } from '../private-tours/use-private-tours';

export function PrivateToursPremium({
  tripId,
  days,
}: {
  readonly tripId: string;
  readonly days?: string;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const tours = usePrivateTours(tripId, days);
  const card = {
    borderRadius: th.radius.cardLarge,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  };
  return (
    <PushScreen
      largeTitle
      title={t({ id: 'drivers.premium.toursTitle', message: 'Private tours' })}
      backLabel={t({ id: 'drivers.back.find', message: 'Find a driver' })}
      scroll={false}
      testID="drivers-tours"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.body,
          {
            paddingHorizontal: th.space.gutter,
            gap: th.space.gap12,
            paddingBottom: insets.bottom + 28,
          },
        ]}
      >
        <Text variant="rowText" tone="muted">
          {t({
            id: 'drivers.tours.intro',
            message:
              'Fixed price, booked and paid with the supplier. Titles, photos and ratings are theirs, word for word.',
          })}
        </Text>
        {tours.loading ? (
          <LoadingCritter
            label={t({ id: 'drivers.tours.loading', message: 'Looking for private cars' })}
          />
        ) : null}
        {tours.cards.map((tour) => {
          const done = tours.added.has(tour.product_id);
          return (
            <View
              key={tour.product_id}
              style={[styles.card, card]}
              testID={`drivers-tour-${tour.product_id}`}
            >
              <Text variant="tier" tone="muted">
                {t({ id: 'drivers.premium.fromViator', message: 'FROM VIATOR' })}
              </Text>
              <Text variant="rowTitle">{tour.title}</Text>
              {tour.price_from === null || tour.currency === null ? null : (
                <Text variant="caption" tone="muted">
                  {t({
                    id: 'drivers.tours.price',
                    message: `From ${tour.currency} ${tour.price_from}`,
                  })}
                </Text>
              )}
              <View style={styles.buttons}>
                <View style={styles.flex}>
                  <Button
                    label={
                      done
                        ? t({ id: 'drivers.tours.added', message: 'In the comparison' })
                        : t({ id: 'drivers.tours.add', message: 'Add to compare' })
                    }
                    size="medium"
                    disabled={!tours.canAdd(tour)}
                    onPress={() => tours.add(tour)}
                    testID={`drivers-tour-add-${tour.product_id}`}
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    label={t({ id: 'drivers.premium.openViator', message: 'Open Viator ↗' })}
                    size="medium"
                    variant="control"
                    onPress={() => tours.openCard(tour)}
                  />
                </View>
              </View>
            </View>
          );
        })}
        {tours.links.map((link) => (
          <View
            key={link.partner}
            style={[styles.card, styles.compact, card]}
            testID={`drivers-tours-link-${link.partner}`}
          >
            <IconTile
              name="car"
              bg={th.color.status.maybe.bg}
              color={th.color.status.maybe.text}
              size={44}
            />
            <View style={styles.flex}>
              <Text variant="tier" tone="muted">
                {link.partner === 'klook'
                  ? t({ id: 'drivers.premium.fromKlook', message: 'FROM KLOOK' })
                  : t({ id: 'drivers.premium.fromViator', message: 'FROM VIATOR' })}
              </Text>
              <Text variant="rowTitle">
                {link.partner === 'klook'
                  ? t({ id: 'drivers.premium.klookSearch', message: 'Private car charters' })
                  : t({ id: 'drivers.premium.viatorSearch', message: 'Private drivers' })}
              </Text>
            </View>
            <Button
              alignSelf="auto"
              label={
                link.partner === 'klook'
                  ? t({ id: 'drivers.premium.openKlook', message: 'Open Klook ↗' })
                  : t({ id: 'drivers.premium.openViator', message: 'Open Viator ↗' })
              }
              size="small"
              variant="control"
              onPress={() => tours.openPartner(link)}
              testID={`drivers-tours-open-${link.partner}`}
            />
          </View>
        ))}
        {tours.down ? (
          <Text variant="caption" tone="muted" testID="drivers-tours-down">
            {t({
              id: 'drivers.tours.down',
              message: 'The suppliers aren’t answering right now. Try again in a bit.',
            })}
          </Text>
        ) : null}
        <DisclosurePremium guide={tours.plan.guide.name} />
      </ScrollView>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8 },
  flex: { flex: 1, minWidth: 0 },
  card: { padding: 14, gap: 6 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 6 },
});
