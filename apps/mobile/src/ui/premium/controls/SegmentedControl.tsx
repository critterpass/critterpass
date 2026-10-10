import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { usePremiumReducedMotion } from '../motion/reduced-motion';
import { SPRINGS } from '../motion/springs';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { segmentFrames } from './control-logic';

export interface SegmentOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
  /** Share of the track (a longer label takes 1.4). @default 1 */
  readonly weight?: number;
}

export interface SegmentedControlProps<Value extends string> {
  readonly options: readonly SegmentOption<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  /** What the control chooses, for assistive tech ("Inbox filter"). */
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

/** The 40-high segmented control: a white thumb that slides on the Snappy spring. */
export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  testID,
}: SegmentedControlProps<Value>) {
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const [width, setWidth] = useState(0);
  const frames = segmentFrames(
    width,
    t.space.segmentTrackPad,
    options.map((o) => o.weight ?? 1),
  );
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const target = frames[index] ?? { x: t.space.segmentTrackPad, width: 0 };

  const x = useSharedValue(target.x);
  const w = useSharedValue(target.width);
  useEffect(() => {
    if (reduced || w.get() === 0) {
      x.set(target.x);
      w.set(target.width);
      return;
    }
    x.set(withSpring(target.x, SPRINGS.snappy));
    w.set(withSpring(target.width, SPRINGS.snappy));
  }, [target.x, target.width, reduced, x, w]);
  const thumb = useAnimatedStyle(() => ({ left: x.value, width: w.value }));

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        minHeight: t.size.segment,
        padding: t.space.segmentTrackPad,
        borderRadius: t.radius.segmentOuter,
        backgroundColor: t.color.segmentTrack,
        flexDirection: 'row',
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: t.space.segmentTrackPad,
            bottom: t.space.segmentTrackPad,
            borderRadius: t.radius.segmentInner,
            backgroundColor: t.color.segmentThumb,
            boxShadow: t.shadow.segmentThumb,
          },
          thumb,
        ]}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={testID === undefined ? undefined : `${testID}-${option.value}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync();
              onChange(option.value);
            }}
            style={{
              flex: option.weight ?? 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: t.space.gap6,
            }}
          >
            <Text variant="segment" tone={selected ? 'ink' : 'inkSecondary'} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
