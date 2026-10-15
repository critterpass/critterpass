/**
 * One way in on Add a booking (7.03): the design's sticker (chat bubble, camera, ticket) leaning
 * on a white card over its label and what it takes.
 */
import { StyleSheet, View } from 'react-native';

import {
  PressableScale,
  StickerIcon,
  Text,
  usePremiumTheme,
  type StickerIconName,
} from '@/ui/premium';

export function AddTile(props: {
  readonly sticker: StickerIconName;
  readonly label: string;
  readonly sub: string;
  readonly tilt: number;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      style={styles.cell}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={[props.label, props.sub].join(', ')}
      testID={props.testID}
    >
      <View
        style={[
          styles.tile,
          {
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        <StickerIcon name={props.sticker} size={46} tilt={props.tilt} />
        <View>
          <Text variant="rowTitle" numberOfLines={1}>
            {props.label}
          </Text>
          <Text variant="captionMuted" tone="muted" numberOfLines={2}>
            {props.sub}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  cell: { flex: 1 },
  tile: { height: 120, padding: 12, justifyContent: 'space-between' },
});
