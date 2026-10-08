/**
 * The trip switcher from props: one row per trip (trips that are over grouped under "Past",
 * called-off ones under "Cancelled"), and a way back to Home when no trip is ahead.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { Stack } from '@/ui/layout/Stack';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { TripRow, type TripListRow } from './trip-row';

const TOKEK = guideSticker('tokek');
const EMPTY_STICKER = 180;

export interface TripListViewProps {
  readonly state: 'loading' | 'ready';
  readonly trips: readonly TripListRow[];
  readonly onOpen: (tripId: string) => void;
  readonly onHome: () => void;
}

export function TripListView({ state, trips, onOpen, onHome }: TripListViewProps) {
  // The TRIPS tab's root: the tab bar is the way out.
  useNoBackByDesign();
  const theme = useTheme();
  const { t } = useLingui();
  const inset = useTabBarInset();
  if (state === 'loading') {
    return (
      <Scaffold variant="dark" edges={['top']} testID="trip-list-loading">
        <View style={{ padding: theme.size.gutter }}>
          <Skeleton preset="list" repeat={3} />
        </View>
      </Scaffold>
    );
  }
  if (trips.length === 0) {
    return (
      <Scaffold variant="dark" edges={['top']} testID="trip-list-empty">
        <Stack gap="20" style={{ padding: theme.size.gutter }}>
          <Text variant="h1" accessibilityRole="header">
            {t({ id: 'trip.list.title', message: 'Your trips' })}
          </Text>
          <Card tone="yellow" halftone radius="cardBig">
            <EmptyState
              guide="tokek"
              guideName="Tokek"
              sticker={
                <Sticker kind={TOKEK.kind} name={TOKEK.name} size={EMPTY_STICKER} pose="wave" />
              }
              title={t({ id: 'trip.list.emptyTitle', message: 'No trips yet' })}
              line={t({
                id: 'trip.list.emptyLine',
                message: 'Pitch a place to your crew from Home and the trip starts here.',
              })}
              action={{
                label: t({ id: 'trip.list.emptyAction', message: 'Go to Home' }),
                onPress: onHome,
              }}
            />
          </Card>
        </Stack>
      </Scaffold>
    );
  }
  const live = trips.filter((trip) => trip.status !== 'cancelled' && trip.status !== 'post_trip');
  const past = trips.filter((trip) => trip.status === 'post_trip');
  const cancelled = trips.filter((trip) => trip.status === 'cancelled');
  const group = (label: string, testID: string) => (
    <Text
      variant="eyebrow"
      color={theme.semantic.text.secondary}
      accessibilityRole="header"
      style={{ marginTop: theme.space['12'] }}
      testID={testID}
    >
      {label}
    </Text>
  );
  return (
    <Scaffold variant="dark" edges={['top']} testID="trip-list">
      <ScrollView
        contentContainerStyle={{
          padding: theme.size.gutter,
          paddingBottom: inset + theme.space['16'],
        }}
      >
        <Stack gap="12">
          <Text variant="h1" accessibilityRole="header">
            {t({ id: 'trip.list.title', message: 'Your trips' })}
          </Text>
          {live.map((trip) => (
            <TripRow key={trip.id} trip={trip} onPress={() => onOpen(trip.id)} />
          ))}
          {/* Nothing ahead (only trips that are over or called off): the way to start the next. */}
          {live.length > 0 ? null : (
            <Stack gap="12" testID="trip-list-none-ahead">
              <Text variant="body" color={theme.semantic.text.secondary} singleLine={false}>
                {t({
                  id: 'trip.list.emptyLine',
                  message: 'Pitch a place to your crew from Home and the trip starts here.',
                })}
              </Text>
              <PillButton
                label={t({ id: 'trip.list.emptyAction', message: 'Go to Home' })}
                tone="yellow"
                onPress={onHome}
                testID="trip-list-home"
              />
            </Stack>
          )}
          {past.length === 0
            ? null
            : group(t({ id: 'trip.list.pastGroup', message: 'Past' }), 'trip-list-past')}
          {past.map((trip) => (
            <TripRow key={trip.id} trip={trip} onPress={() => onOpen(trip.id)} />
          ))}
          {cancelled.length === 0
            ? null
            : group(
                t({ id: 'trip.list.cancelledGroup', message: 'Cancelled' }),
                'trip-list-cancelled',
              )}
          {cancelled.map((trip) => (
            <TripRow key={trip.id} trip={trip} onPress={() => onOpen(trip.id)} />
          ))}
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
