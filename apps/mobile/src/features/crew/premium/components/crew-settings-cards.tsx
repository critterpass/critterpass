/** Crew settings' trips still going (and "Plan a trip") and its notification card (3.12). */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { ActionSheetIOS, Platform, StyleSheet, View } from 'react-native';

import type { CrewNotifyLevel } from '@cp/domain';

import { hrefFor } from '@/lib/navigation/screen-registry';
import {
  Icon,
  ListCard,
  PressableScale,
  Row,
  StatusTag,
  Text,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';
import { optionsAlert } from '@/ui/premium/shell';

import type { CrewDetail } from '../../settings/use-crew-detail';
import { tripDatesLine, tripStatusWord } from '../crew-copy';

function Chevron() {
  const th = usePremiumTheme();
  return <Icon name="forward" size={16} color={th.color.placeholder} />;
}

export function CrewTripsCard({
  crewId,
  trips,
  now,
  locale,
}: {
  readonly crewId: string;
  readonly trips: CrewDetail['trips'];
  readonly now: Date;
  readonly locale: string;
}) {
  const th = usePremiumTheme();
  // The crew's next trip starts as a pitch (the place vote), as Trips' "+" does.
  const pitch = hrefFor('3b-3', { crewId });
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
              <View style={styles.trailing}>
                <StatusTag
                  label={tripStatusWord(trip.status)}
                  tone={trip.status === 'in_trip' ? 'booked' : 'voteOpen'}
                />
                <Chevron />
              </View>
            }
            onPress={() => router.push(`/hub/${trip.id}`)}
            testID={`crew-settings-trip-${trip.id}`}
          />
        );
      })}
      {pitch === undefined ? null : (
        <PressableScale
          key="plan"
          accessibilityRole="button"
          onPress={() => router.push(pitch)}
          style={[
            styles.row,
            { paddingHorizontal: th.space.rowPadH, paddingVertical: th.space.rowPadV },
          ]}
          testID="crew-settings-plan-trip"
        >
          <Text variant="rowTitle" color={th.color.status.rain.text} style={styles.grow}>
            {t({ id: 'crew.premium.settings.planTrip', message: 'Plan a trip' })}
          </Text>
          <Chevron />
        </PressableScale>
      )}
    </ListCard>
  );
}

function levelWord(level: CrewNotifyLevel): string {
  switch (level) {
    case 'all':
      return t({ id: 'crew.premium.notify.all', message: 'Everything' });
    case 'mentions':
      return t({ id: 'crew.settings.notifyMentions', message: 'Mentions' });
    case 'off':
      return t({ id: 'crew.premium.notify.off', message: 'Nothing' });
  }
}

const LEVELS: readonly CrewNotifyLevel[] = ['all', 'mentions', 'off'];

/** The level choice: the system action sheet on iOS, the drawn options sheet on Android. */
function chooseLevel(onLevel: (level: CrewNotifyLevel) => void): void {
  const header = t({ id: 'crew.settings.notify', message: 'Notifications' });
  const close = t({ id: 'crew.premium.cancel', message: 'Cancel' });
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title: header, options: [...LEVELS.map(levelWord), close], cancelButtonIndex: 3 },
      (index) => {
        const level = LEVELS[index];
        if (level !== undefined) onLevel(level);
      },
    );
    return;
  }
  optionsAlert({
    header,
    options: LEVELS.map((level) => ({ label: levelWord(level), run: () => onLevel(level) })),
    close,
  });
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
  const keepLabel = t({ id: 'crew.premium.keepChat', message: 'Keep chat if I leave' });
  return (
    <ListCard>
      <Row
        title={t({ id: 'crew.settings.notify', message: 'Notifications' })}
        trailingText={levelWord(level)}
        trailing={<Chevron />}
        onPress={() => chooseLevel(onLevel)}
        testID="crew-settings-notify"
      />
      <View
        style={[
          styles.row,
          {
            minHeight: th.size.hit,
            paddingHorizontal: th.space.rowPadH,
            paddingVertical: th.space.rowPadV,
          },
        ]}
      >
        <Text variant="rowTitle" style={styles.grow}>
          {keepLabel}
        </Text>
        <Toggle
          value={keepChat}
          onChange={onKeepChat}
          accessibilityLabel={keepLabel}
          testID="crew-leave-keep-chat"
        />
      </View>
    </ListCard>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
