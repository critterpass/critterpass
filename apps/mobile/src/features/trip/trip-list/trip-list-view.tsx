/**
 * The trip switcher from props: one row per trip, or a way back to Home when there is none.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
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
          {trips.map((trip) => (
            <TripRow key={trip.id} trip={trip} onPress={() => onOpen(trip.id)} />
          ))}
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
