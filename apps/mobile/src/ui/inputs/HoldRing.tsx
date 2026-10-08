import { t } from '@lingui/core/macro';
import { Canvas, Path } from '@shopify/react-native-skia';
import type { ReactNode } from 'react';
import { Alert, View } from 'react-native';
import type { AccessibilityActionEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { HOLD_FILL_LEGENDARY_MS, HOLD_FILL_MS, useHoldFill } from '@/motion/gestures/hold-fill';

import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export type HoldRingTone = 'green' | 'gold' | 'pink';

export interface HoldRingProps {
  /** Ring centre label ("Hold"). */
  readonly label: string;
  /** Action name for screen readers and Switch Control ("Befriend", "Send SOS"). */
  readonly actionLabel: string;
  readonly onComplete: () => void;
  /** @default 'green'; gold holds longer (legendary), pink is destructive. */
  readonly tone?: HoldRingTone;
  /** Destructive holds ask for confirmation when triggered without the gesture. */
  readonly destructive?: boolean;
  /** Confirmation copy for the non-gesture path of a destructive hold. */
  readonly confirmMessage?: string;
  /**
   * A destructive hold triggered without the gesture (a screen reader, Switch Control) asks first:
   * the host shows its confirmation (a `ConfirmSheet`) and calls `confirm` when the person agrees.
   * A host that passes none gets the system alert.
   */
  readonly onConfirmRequest?: ((confirm: () => void) => void) | undefined;
  /** Dwell-driven fill (e.g. staying at a place) instead of touch-and-hold. */
  readonly progress?: SharedValue<number>;
  /** @default 88 */
  readonly size?: number;
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly testID?: string;
}

const STROKE = 10;

/* eslint-disable lingui/no-unlocalized-strings -- SVG path commands, never rendered copy. */
function ringPath(size: number): string {
  const r = (size - STROKE) / 2;
  const c = size / 2;
  // Starts at 12 o'clock and runs clockwise so `end` trims a conic fill.
  return `M${c} ${c - r}A${r} ${r} 0 1 1 ${c} ${c + r}A${r} ${r} 0 1 1 ${c} ${c - r}`;
}
/* eslint-enable lingui/no-unlocalized-strings */

const useStyles = makeStyles(() => ({
  ring: { alignItems: 'center', justifyContent: 'center' },
  centre: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
}));

/** Conic hold-to-confirm ring (befriend, SOS, legendary), touch- or dwell-driven, with an a11y action. */
export function HoldRing({
  label,
  actionLabel,
  onComplete,
  tone = 'green',
  destructive = tone === 'pink',
  confirmMessage,
  onConfirmRequest,
  progress,
  size = 88,
  children,
  disabled = false,
  testID,
}: HoldRingProps) {
  const styles = useStyles();
  const theme = useTheme();
  const fill = useHoldFill({
    fillMs: tone === 'gold' ? HOLD_FILL_LEGENDARY_MS : HOLD_FILL_MS,
    onComplete,
    disabled,
    accessibilityLabel: actionLabel,
    ...(progress ? { externalProgress: progress } : {}),
  });
  const colour =
    tone === 'gold'
      ? theme.color.gold.base
      : tone === 'pink'
        ? theme.semantic.state.urgent
        : theme.semantic.state.success;
  const path = ringPath(size);

  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName !== 'activate') return;
    if (!destructive) {
      fill.onAccessibilityAction(event);
      return;
    }
    const confirm = () => fill.onAccessibilityAction(event);
    if (onConfirmRequest) {
      onConfirmRequest(confirm);
      return;
    }
    Alert.alert(actionLabel, confirmMessage, [
      { text: t({ id: 'common.confirm.cancel', message: 'Cancel' }), style: 'cancel' },
      { text: actionLabel, style: 'destructive', onPress: confirm },
    ]);
  };

  return (
    <GestureDetector gesture={fill.gesture}>
      <View
        testID={testID}
        style={[styles.ring, { width: size, height: size }]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        accessibilityState={{ disabled }}
        accessibilityActions={disabled ? [] : fill.accessibilityActions}
        onAccessibilityAction={disabled ? undefined : onAction}
      >
        <Canvas style={{ width: size, height: size }}>
          <Path path={path} style="stroke" strokeWidth={STROKE} color={theme.semantic.bg.control} />
          <Path
            path={path}
            style="stroke"
            strokeWidth={STROKE}
            strokeCap="round"
            color={colour}
            start={0}
            end={fill.progress}
          />
        </Canvas>
        <Animated.View style={[styles.centre, fill.animatedStyle]}>
          {children ?? <Text variant="label">{label}</Text>}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
