/**
 * A "While you wait" tile (3.01): 118 high, r24 card, a doodle sticker at the top, a 15/700 title
 * and a muted line, pushed apart.
 */
import { View } from 'react-native';

import { CritterSticker, PressableScale, Text, makePremiumStyles } from '@/ui/premium';

const useStyles = makePremiumStyles((t) => ({
  tile: {
    flex: 1,
    minHeight: 118,
    borderRadius: t.radius.cardRow,
    backgroundColor: t.color.card,
    boxShadow: t.shadow.card,
    padding: t.space.rowPadH,
    justifyContent: 'space-between',
  },
  title: { fontWeight: '700' },
}));

export interface WaitTileProps {
  readonly critter: string;
  readonly title: string;
  readonly sub: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

export function WaitTile({ critter, title, sub, onPress, testID }: WaitTileProps) {
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${title}. ${sub}`}
      style={styles.tile}
      {...(testID === undefined ? {} : { testID })}
    >
      <CritterSticker kind={critter} name={critter} size={40} pose="point" />
      <View>
        <Text variant="rowTitle" style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {sub}
        </Text>
      </View>
    </PressableScale>
  );
}
