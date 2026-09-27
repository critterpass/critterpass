/**
 * Cluster bubble ("+9") for a group of nearby pins too close together to show individually at the
 * current zoom (map spec "Pins": "cluster bubble '+9'"). Tapping expands the cluster (`onPress`,
 * usually a fly-to-bounds via `useFlyTo`) — the "cluster expanded" missing state is `CpMap` no
 * longer rendering this bubble and rendering the member pins instead, not a prop on this component.
 */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { Pressable, StyleSheet, Text } from 'react-native';

export interface ClusterBubbleProps {
  readonly count: number;
  readonly onPress?: () => void;
}

export function ClusterBubble({ count, onPress }: ClusterBubbleProps) {
  const { t } = useLingui();
  const label = t({
    id: 'map.clusterBubble.accessibilityLabel',
    // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
    message: `${{ count }} places here, tap to expand`,
  });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="cluster-bubble"
      style={styles.bubble}
    >
      <Text style={styles.count}>{`+${String(count)}`}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.blue,
    borderWidth: 2,
    borderColor: tokens.color.ink[900],
  },
  count: {
    color: tokens.color.paper.bright,
    fontWeight: '700',
    fontSize: tokens.type.body.sm.fontSize,
  },
});
