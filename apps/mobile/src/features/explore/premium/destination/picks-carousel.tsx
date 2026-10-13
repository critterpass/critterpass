/**
 * The guide's first-timer picks on a destination page (4.04): tinted cards with the kind's doodle
 * and the name, sponsored ones labelled, in a row that bleeds off the edge; the map one tap away.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { PressableScale, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import type { DestinationViewProps } from '../../screens/destination-view-props';
import { placeIcon } from '../../search/place-icons';
import { Doodle } from '../components/doodle';

export function PicksCarousel(props: {
  readonly title: string;
  readonly picks: DestinationViewProps['picks'];
  readonly onOpenPick: DestinationViewProps['onOpenPick'];
  readonly onMap: DestinationViewProps['onMap'];
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  if (props.picks.length === 0) return null;
  return (
    <View style={{ gap: theme.space.gap8 }} testID="explore-picks">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.space.gap10,
        }}
      >
        <Text variant="label" tone="muted" style={{ flex: 1 }}>
          {props.title}
        </Text>
        {props.onMap === undefined ? null : (
          <TextButton
            label={t({ id: 'explore.premium.dest.map', message: 'Map ›' })}
            onPress={props.onMap}
            testID="explore-dest-map"
          />
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -theme.space.gap16 }}
        contentContainerStyle={{
          gap: theme.space.gap10,
          paddingHorizontal: theme.space.gap16,
        }}
      >
        {props.picks.map((pick, index) => (
          <PressableScale
            key={pick.id}
            onPress={props.onOpenPick === undefined ? undefined : () => props.onOpenPick?.(pick)}
            disabled={props.onOpenPick === undefined}
            accessibilityRole="button"
            accessibilityLabel={pick.name}
            testID={`explore-pick-${pick.id}`}
            style={{
              width: 150,
              height: 120,
              borderRadius: theme.radius.banner,
              padding: theme.space.gap12,
              justifyContent: 'space-between',
              backgroundColor: [
                theme.color.status.tangerine.bg,
                theme.color.status.voteOpen.bg,
                theme.color.status.booked.bg,
              ][index % 3],
            }}
          >
            <Doodle name={placeIcon(pick.category)} size={44} />
            <View>
              {pick.sponsored === undefined ? null : (
                <Text variant="badge" tone="muted">
                  {t({ id: 'explore.premium.dest.sponsored', message: 'Sponsored' })}
                </Text>
              )}
              <Text variant="rowTextStrong" numberOfLines={2}>
                {pick.name}
              </Text>
            </View>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}
