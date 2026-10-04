/**
 * The search bar docked under the hero (7g-1): the guide's sticker and "Search Bali, or ask
 * Tokek". It is a door, not a field: tapping it opens the trip's search scoped to Explore.
 */
import { View } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { GuideFacts } from '../format';

export const DOCKED_SEARCH_HEIGHT = 52;

export interface DockedSearchProps {
  readonly guide: GuideFacts;
  readonly placeholder: string;
  readonly onPress?: (() => void) | undefined;
  readonly testID?: string | undefined;
}

const useStyles = makeStyles((t) => ({
  bar: {
    height: DOCKED_SEARCH_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    paddingHorizontal: t.space['14'],
    borderRadius: DOCKED_SEARCH_HEIGHT / 2,
    backgroundColor: t.semantic.bg.raised,
  },
  text: { flex: 1, minWidth: 0 },
}));

export function DockedSearch({ guide, placeholder, onPress, testID }: DockedSearchProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      disabled={onPress === undefined}
      onPress={onPress}
      testID={testID}
    >
      <View style={styles.bar}>
        <Sticker kind={guide.kind} name={guide.name} size={28} />
        <View style={styles.text}>
          <Text variant="body" color={theme.semantic.text.secondary} numberOfLines={1}>
            {placeholder}
          </Text>
        </View>
      </View>
    </PressScale>
  );
}
