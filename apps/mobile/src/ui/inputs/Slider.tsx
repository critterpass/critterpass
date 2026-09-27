import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';
import type { AccessibilityActionEvent, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { MIN_TOUCH_TARGET, makeStyles, useTheme } from '../theme';

export interface SliderProps {
  /** 0–1. */
  readonly value: number;
  readonly onChange: (value: number) => void;
  /** Accessible name ("Music volume"). */
  readonly label: string;
  /** Screen-reader increment. @default 0.1 */
  readonly step?: number;
  readonly disabled?: boolean;
  readonly testID?: string;
}

const KNOB = 24;
const TRACK = 6;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Continuous 0–1 slider (music/effects levels); adjustable by drag, tap or screen-reader swipe. */
export function Slider({
  value,
  onChange,
  label,
  step = 0.1,
  disabled = false,
  testID,
}: SliderProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const usable = Math.max(1, width - KNOB);
  const set = (next: number) => onChange(clamp(Math.round(next * 100) / 100));

  const pan = Gesture.Pan()
    .enabled(!disabled && width > 0)
    .minDistance(0)
    .onBegin((event) => {
      'worklet';
      scheduleOnRN(set, (event.x - KNOB / 2) / usable);
    })
    .onUpdate((event) => {
      'worklet';
      scheduleOnRN(set, (event.x - KNOB / 2) / usable);
    });

  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') set(value + step);
    if (event.nativeEvent.actionName === 'decrement') set(value - step);
  };
  const percent = Math.round(clamp(value) * 100);

  return (
    <GestureDetector gesture={pan}>
      <View
        testID={testID}
        style={styles.target}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: percent,
          text: t({ id: 'common.slider.percent', message: `${percent}%` }),
        }}
        accessibilityActions={disabled ? [] : [{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
      >
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              {
                width: clamp(value) * usable + KNOB / 2,
                backgroundColor: theme.semantic.action.primary,
              },
            ]}
          />
        </View>
        <View
          style={[styles.knob, { start: clamp(value) * usable, opacity: disabled ? 0.4 : 1 }]}
        />
      </View>
    </GestureDetector>
  );
}

const useStyles = makeStyles((t) => ({
  target: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  track: {
    height: TRACK,
    borderRadius: TRACK / 2,
    backgroundColor: t.semantic.bg.control,
    overflow: 'hidden',
  },
  fill: { height: TRACK },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: t.color.paper.base,
    borderWidth: 3,
    borderColor: t.semantic.bg.base,
  },
}));
