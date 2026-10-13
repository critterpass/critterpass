/** Crew settings' trips still going and its notification card (3.12). */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { CrewNotifyLevel } from '@cp/domain';

import {
  Card,
  ListCard,
  Row,
  SegmentedControl,
  StatusTag,
  Text,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';

import type { CrewDetail } from '../../settings/use-crew-detail';
import { tripDatesLine, tripStatusWord } from '../crew-copy';

export function CrewTripsCard({
  trips,
  now,
  locale,
}: {
  readonly trips: CrewDetail['trips'];
  readonly now: Date;
  readonly locale: string;
}) {
  if (trips.length === 0) return null;
  return (
    <ListCard>
      {trips.map((trip) => {
        const dates = tripDatesLine(trip, now, locale);
        return (
          <Row
            key={trip.id}
            title={trip.place ?? t({ id: 'crew.premium.settings.tripUnnamed', message: 'A trip' })}
            {...(dates === null ? {} : { subtitle: dates })}
            trailing={
              <StatusTag
                label={tripStatusWord(trip.status)}
                tone={trip.status === 'in_trip' ? 'booked' : 'voteOpen'}
              />
            }
            onPress={() => router.push(`/hub/${trip.id}`)}
            testID={`crew-settings-trip-${trip.id}`}
          />
        );
      })}
    </ListCard>
  );
}

export function CrewNotifyCard({
  level,
  onLevel,
  keepChat,
  onKeepChat,
}: {
  readonly level: CrewNotifyLevel;
  readonly onLevel: (level: CrewNotifyLevel) => void;
  readonly keepChat: boolean;
  readonly onKeepChat: (keep: boolean) => void;
}) {
  const th = usePremiumTheme();
  return (
    <Card padded style={{ gap: th.space.gap12 }}>
      <Text variant="rowText">{t({ id: 'crew.settings.notify', message: 'Notifications' })}</Text>
      <SegmentedControl
        accessibilityLabel={t({ id: 'crew.settings.notify', message: 'Notifications' })}
        options={[
          {
            value: 'all' as const,
            label: t({ id: 'crew.premium.notify.all', message: 'Everything' }),
          },
          {
            value: 'mentions' as const,
            label: t({ id: 'crew.settings.notifyMentions', message: 'Mentions' }),
          },
          {
            value: 'off' as const,
            label: t({ id: 'crew.premium.notify.off', message: 'Nothing' }),
          },
        ]}
        value={level}
        onChange={onLevel}
        testID="crew-settings-notify"
      />
      <View style={styles.toggleRow}>
        <Text variant="rowText" style={styles.grow}>
          {t({ id: 'crew.premium.keepChat', message: 'Keep chat if I leave' })}
        </Text>
        <Toggle
          value={keepChat}
          onChange={onKeepChat}
          accessibilityLabel={t({
            id: 'crew.premium.keepChat',
            message: 'Keep chat if I leave',
          })}
          testID="crew-leave-keep-chat"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
