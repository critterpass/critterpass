import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { makeStyles } from '../theme';

export interface ScanLine {
  readonly id: string;
  /** Top edge and height as fractions of the frame, 0 to 1. */
  readonly top: number;
  readonly height: number;
}

export interface ScanOverlayProps {
  /** Camera feed or captured image. */
  readonly children?: ReactNode;
  /** Sweeping while the reader works. */
  readonly scanning: boolean;
  /** Lines recognised so far; each lights up yellow. */
  readonly lines?: readonly ScanLine[];
  readonly testID?: string;
}

const SWEEP_MS = tokens.motion.duration.extra * 2;

const useStyles = makeStyles((th) => ({
  root: { flex: 1, overflow: 'hidden' },
  sweep: {
    position: 'absolute',
    start: 0,
    end: 0,
    height: th.space['4'],
    backgroundColor: th.semantic.action.primary,
  },
  line: {
    position: 'absolute',
    start: th.space['12'],
    end: th.space['12'],
    borderRadius: th.radius.xs,
    borderWidth: th.space['2'],
    borderColor: th.semantic.action.primary,
  },
}));

/** Receipt/menu scan: a sweeping line while reading and highlighted boxes on recognised lines. */
export function ScanOverlay({ children, scanning, lines = [], testID }: ScanOverlayProps) {
  const styles = useStyles();
  const reduced = useReducedImpactMotion();
  const [height, setHeight] = useState(0);
  const y = useSharedValue(0);
  useEffect(() => {
    if (!scanning || reduced || height === 0) {
      y.value = 0;
      return;
    }
    y.value = withRepeat(withTiming(height, { duration: SWEEP_MS }), -1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- y is a stable shared value ref.
  }, [scanning, reduced, height]);
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const count = lines.length;
  const label = scanning
    ? t({ id: 'common.camera.scanning', message: `Scanning, ${count} lines read` })
    : t({ id: 'common.camera.scanned', message: `${count} lines read` });
  return (
    <View
      testID={testID}
      style={styles.root}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      accessibilityState={{ busy: scanning }}
    >
      {children}
      {lines.map((line) => (
        <View
          key={line.id}
          style={[styles.line, { top: `${line.top * 100}%`, height: `${line.height * 100}%` }]}
          pointerEvents="none"
        />
      ))}
      {scanning && !reduced ? (
        <Animated.View style={[styles.sweep, sweep]} pointerEvents="none" />
      ) : null}
    </View>
  );
}
