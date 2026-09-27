/**
 * Slot that positions a guide sprite beside `YouDot` and passes the map's compass heading through
 * (map spec "Camera": "compass heading passthrough for guide sprite"). Takes a render prop rather than
 * importing guide art directly — the map layer does not own `packages/critter-art`/the guide persona
 * pack (P05), so the actual sprite is supplied by whichever screen composes `CpMap` with a guide.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export interface GuideSpriteSlotProps {
  /** Compass heading in degrees (0-360), passed through from the map camera. */
  readonly heading: number;
  readonly children: (heading: number) => ReactNode;
}

export function GuideSpriteSlot({ heading, children }: GuideSpriteSlotProps) {
  return (
    <View testID="guide-sprite-slot" style={styles.slot}>
      {children(heading)}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    marginLeft: 8,
  },
});
