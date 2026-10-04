/**
 * SWIPE TOGETHER (7g-1): the pink card into the crew's swipe, with JOIN when the trip has an open
 * session or START when there is none. Who is swiping right now shows on the swipe screen.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import * as copy from './copy';
import type { SwipeLive } from './trip-explore-model';

export interface SwipeTogetherCardProps {
  readonly deckSize: number;
  readonly live: SwipeLive;
  readonly onPress: () => void;
}

const useStyles = makeStyles((t) => ({
  card: {
    marginHorizontal: t.size.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    padding: t.space['14'],
    borderRadius: t.radius.lg,
    backgroundColor: t.color.pink,
  },
  body: { flex: 1, minWidth: 0, gap: t.space['2'] },
  pill: {
    paddingHorizontal: t.space['14'],
    paddingVertical: t.space['8'],
    borderRadius: t.radius.lg,
    backgroundColor: t.color.ink[900],
  },
}));

export function SwipeTogetherCard({ deckSize, live, onPress }: SwipeTogetherCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  const ink = theme.color.ink[900];
  const title = copy.swipeTitle();
  return (
    <PressScale accessibilityLabel={title} onPress={onPress} testID="explore-trip-swipe">
      <View style={styles.card}>
        <View style={styles.body}>
          <Text variant="h3" color={ink}>
            {upper(title, i18n.locale)}
          </Text>
          <Text variant="bodySm" color={ink}>
            {copy.swipeBody(deckSize)}
          </Text>
        </View>
        <View style={styles.pill} testID={`explore-trip-swipe-${live.kind}`}>
          <Text variant="label" color={theme.color.pink}>
            {upper(copy.swipePill(live), i18n.locale)}
          </Text>
        </View>
      </View>
    </PressScale>
  );
}
