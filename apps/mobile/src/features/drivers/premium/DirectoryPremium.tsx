/**
 * Drivers our crews used (6.25): the area, English and 7+ seats as chips (picked in ink), then one
 * card per listed driver (initial, name, car, how many crews loved him). Nobody in the area says so
 * with the nearest listed area to widen to. Offline it shows the last list kept on the phone.
 */
import type { DriverDirectoryCard } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';

import { crewAccent } from '@/features/trip';
import {
  Avatar,
  Button,
  EmptyState,
  PressableScale,
  Skeleton,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useVehicleLine } from '../shared/vehicle-line';
import { useDirectory } from '../directory/use-directory';

function DriverRow({
  driver,
  onOpen,
}: {
  readonly driver: DriverDirectoryCard;
  readonly onOpen: (id: string) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const car = useVehicleLine(driver);
  const trips = driver.trips;
  const loved = driver.crews_loved;
  return (
    <PressableScale
      onPress={() => onOpen(driver.id)}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={driver.display_name}
      testID={`drivers-row-${driver.id}`}
    >
      <View
        style={[
          styles.row,
          {
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        <Avatar name={driver.display_name} color={crewAccent(driver.id.length)} size={44} />
        <View style={styles.flex}>
          <Text variant="rowTitle" numberOfLines={1}>
            {driver.display_name}
          </Text>
          <Text variant="captionMuted" tone="muted" numberOfLines={1}>
            {[car, driver.areas.join(', ')].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.end}>
          <Text variant="rowTextStrong">
            {t({ id: 'drivers.card.trips', message: `${trips} trips` })}
          </Text>
          {loved === null ? null : (
            <Text variant="captionMuted" color={th.color.status.booked.text}>
              {t({ id: 'drivers.premium.loved', message: `${loved} crews loved him` })}
            </Text>
          )}
        </View>
      </View>
    </PressableScale>
  );
}

export function DirectoryPremium(input: { readonly tripId: string; readonly area: string | null }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const p = useDirectory(input);
  const area = p.filters.areas[0] ?? null;
  const widenTo = p.widenTo;
  const empty = !p.loading && p.failure == null && p.drivers.length === 0;
  return (
    <PushScreen
      title={t({ id: 'drivers.premium.navTitle', message: 'Drivers' })}
      backLabel={t({ id: 'drivers.directory.back', message: 'Find a driver' })}
      testID="drivers-directory"
    >
      <View style={[styles.body, { paddingHorizontal: th.space.gutter, gap: th.space.gap14 }]}>
        <Text variant="largeTitle" accessibilityRole="header">
          {t({ id: 'drivers.directory.title', message: 'Drivers our crews used' })}
        </Text>
        <Text variant="rowText" tone="muted">
          {t({
            id: 'drivers.directory.intro',
            message:
              'Only drivers who asked to be listed. Ratings come from crews who rode with them.',
          })}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {p.areaChips.map((chip) => (
            <Button
              key={chip}
              label={chip}
              size="small"
              variant={p.filters.areas.includes(chip) ? 'primary' : 'floating'}
              onPress={() => p.onToggleArea(chip)}
              testID={`drivers-area-${chip}`}
            />
          ))}
          {p.languageChip === null ? null : (
            <Button
              label={p.languageChip}
              size="small"
              variant={p.filters.language === null ? 'floating' : 'primary'}
              onPress={p.onToggleLanguage}
              testID="drivers-language"
            />
          )}
          <Button
            label={t({ id: 'drivers.directory.sevenPlus', message: '7+ seats' })}
            size="small"
            variant={p.filters.sevenPlus ? 'primary' : 'floating'}
            onPress={p.onToggleSevenPlus}
            testID="drivers-seven-plus"
          />
          <Button
            label={t({ id: 'drivers.directory.dayTrips', message: 'Day trips' })}
            size="small"
            variant={p.filters.dayTrips ? 'primary' : 'floating'}
            onPress={p.onToggleDayTrips}
            testID="drivers-day-trips"
          />
        </ScrollView>
        {p.staleLine === null ? null : (
          <Text variant="caption" color={th.color.status.tangerine.text}>
            {p.staleLine}
          </Text>
        )}
        {p.loading && p.drivers.length === 0 ? (
          <Skeleton height={140} radius={th.radius.card} />
        ) : null}
        {p.failure == null ? null : (
          <View style={{ gap: th.space.gap8 }}>
            <Text variant="body" tone="muted" align="center">
              {p.failure === 'offline'
                ? t({
                    id: 'drivers.premium.offline',
                    message: 'This needs signal. Try again when you have some.',
                  })
                : t({ id: 'drivers.premium.failed', message: "That didn't load. Try again." })}
            </Text>
            {p.onRetry === undefined ? null : (
              <Button
                label={t({ id: 'drivers.premium.retry', message: 'Try again' })}
                variant="secondary"
                onPress={p.onRetry}
                testID="drivers-directory-retry"
              />
            )}
          </View>
        )}
        {empty ? (
          <View style={{ gap: th.space.gap12 }} testID="drivers-empty">
            <EmptyState
              title={
                area === null
                  ? t({ id: 'drivers.directory.emptyAny', message: 'Nobody listed yet' })
                  : t({
                      id: 'drivers.directory.empty',
                      message: `Nobody listed around ${area} yet`,
                    })
              }
              line={
                widenTo === null
                  ? t({
                      id: 'drivers.directory.emptyLineNone',
                      message: 'No crew has brought back a driver here who asked to be listed.',
                    })
                  : t({
                      id: 'drivers.directory.emptyLine',
                      message: `No crew has brought back a driver here who asked to be listed. Listed drivers cover ${widenTo}.`,
                    })
              }
            />
            {widenTo === null ? null : (
              <Button
                label={t({ id: 'drivers.directory.widen', message: `Show ${widenTo} too` })}
                onPress={p.onWiden}
                testID="drivers-widen"
              />
            )}
          </View>
        ) : null}
        <View style={{ gap: th.space.gap10 }}>
          {p.drivers.map((driver) => (
            <DriverRow key={driver.id} driver={driver} onOpen={p.onOpen} />
          ))}
        </View>
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 40 },
  chips: { gap: 8, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  flex: { flex: 1, minWidth: 0 },
  end: { alignItems: 'flex-end', gap: 2 },
});
