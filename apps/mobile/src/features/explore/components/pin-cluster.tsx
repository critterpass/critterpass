/** Places too close together to tell apart at this zoom: a "+9" bubble that opens them up. */
import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

/** A fixed box: the annotation is measured once, before the bubble lays out. */
export const CLUSTER_BOX = 52;
const BUBBLE = 44;

const useStyles = makeStyles((t) => ({
  box: { width: CLUSTER_BOX, height: CLUSTER_BOX, alignItems: 'center', justifyContent: 'center' },
  bubble: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.semantic.bg.control,
    borderWidth: t.space['2'],
    borderColor: t.semantic.bg.base,
  },
}));

export function PinCluster({
  count,
  onPress,
}: {
  readonly count: number;
  readonly onPress: () => void;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  return (
    <View style={styles.box} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t({
          id: 'explore.map.cluster',
          message: `${count} places here. Tap to spread them out.`,
        })}
        onPress={onPress}
        style={styles.bubble}
        testID="explore-pin-cluster"
      >
        <Text variant="label" numberOfLines={1}>{`+${String(count)}`}</Text>
      </Pressable>
    </View>
  );
}
