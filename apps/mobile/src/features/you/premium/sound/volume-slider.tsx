/**
 * A 0–1 volume slider in the premium kit's controls: the segment track with the ink fill and the
 * white toggle knob, between a quiet and a loud speaker mark. Drag or tap to set it; a screen
 * reader swipes it up and down by a tenth.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { Text, usePremiumTheme } from '@/ui/premium';

const KNOB = 26;
const TRACK = 6;
const STEP = 0.1;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function VolumeSlider({
  value,
  onChange,
  label,
  disabled = false,
  testID,
}: {
  readonly value: number;
  readonly onChange: (next: number) => void;
  readonly label: string;
  readonly disabled?: boolean;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
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
    if (event.nativeEvent.actionName === 'increment') set(value + STEP);
    if (event.nativeEvent.actionName === 'decrement') set(value - STEP);
  };
  const percent = Math.round(clamp(value) * 100);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: th.space.gap12,
        paddingHorizontal: th.space.rowPadH,
        opacity: disabled ? th.opacity.disabled : 1,
      }}
    >
      <Text variant="rowTitle" tone="muted" accessible={false}>
        –
      </Text>
      <GestureDetector gesture={pan}>
        <View
          testID={testID}
          style={{ flex: 1, minHeight: th.size.hit, justifyContent: 'center' }}
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
          <View
            style={{
              height: TRACK,
              borderRadius: TRACK / 2,
              backgroundColor: th.color.segmentTrack,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: TRACK,
                width: clamp(value) * usable + KNOB / 2,
                backgroundColor: th.color.ink,
              }}
            />
          </View>
          <View
            style={{
              position: 'absolute',
              start: clamp(value) * usable,
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              backgroundColor: th.color.toggleKnob,
              boxShadow: th.shadow.toggleKnob,
            }}
          />
        </View>
      </GestureDetector>
      <Text variant="rowTitle" tone="muted" accessible={false}>
        +
      </Text>
    </View>
  );
}
