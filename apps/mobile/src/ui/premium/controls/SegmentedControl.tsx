import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { usePremiumReducedMotion } from '../motion/reduced-motion';
import { SPRINGS } from '../motion/springs';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { fitSegments, segmentFrames } from './control-logic';

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
  /**
   * A list filter: 34 high and as wide as its labels (each segment padded 14 a side), for a row
   * that leaves the control its own width. Without it the control fills its parent's width.
   */
  readonly hug?: boolean;
  /**
   * `ink`: the ink thumb with white text, as the design sets a small control inside a settings row
   * (9.04 How chatty); `light` is the white thumb of a page's own switch. @default 'light'
   */
  readonly thumb?: 'light' | 'ink';
  readonly testID?: string;
}

interface Frame {
  readonly x: number;
  readonly width: number;
}

/** The 40-high segmented control: a white thumb that slides on the Snappy spring. */
export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  hug = false,
  thumb: thumbTone = 'light',
  testID,
}: SegmentedControlProps<Value>) {
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const [width, setWidth] = useState(0);
  // A hugging control measures each segment: its labels set the widths, not weights.
  const [measured, setMeasured] = useState<Readonly<Record<string, Frame>>>({});
  // Each label's one-line width at full size: the labels share one size and stay on one line,
  // shrinking together or taking shares by their widths (`fitSegments`).
  const [natural, setNatural] = useState<Readonly<Record<string, number>>>({});
  const fit = fitSegments({
    width,
    trackPad: t.space.segmentTrackPad,
    pad: t.space.gap6,
    weights: options.map((o) => o.weight ?? 1),
    natural: options.map((o) => natural[o.value]),
  });
  const frames: readonly (Frame | undefined)[] = hug
    ? options.map((o) => measured[o.value])
    : segmentFrames(width, t.space.segmentTrackPad, fit.weights);
  const labelSize = hug || fit.scale === 1 ? null : { fontSize: t.type.segment.size * fit.scale };
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
  const ink = thumbTone === 'ink';

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        minHeight: hug ? t.size.pillSmall : t.size.segment,
        padding: t.space.segmentTrackPad,
        borderRadius: hug ? t.radius.pillSmall : t.radius.segmentOuter,
        ...(hug ? { alignSelf: 'flex-start' as const } : {}),
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
            borderRadius: hug
              ? t.radius.pillSmall - t.space.segmentTrackPad
              : t.radius.segmentInner,
            backgroundColor: ink ? t.color.inkSurface : t.color.segmentThumb,
            boxShadow: t.shadow.segmentThumb,
          },
          thumb,
        ]}
      />
      {hug ? null : (
        <View
          pointerEvents="none"
          style={styles.measure}
          importantForAccessibility="no-hide-descendants"
        >
          {options.map((option) => (
            <Text
              key={option.value}
              variant="segment"
              numberOfLines={1}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                setNatural((all) =>
                  all[option.value] === w ? all : { ...all, [option.value]: w },
                );
              }}
            >
              {option.label}
            </Text>
          ))}
        </View>
      )}
      {options.map((option, at) => {
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
            {...(hug
              ? {
                  onLayout: (e: LayoutChangeEvent) => {
                    const { x, width: w } = e.nativeEvent.layout;
                    setMeasured((all) => ({ ...all, [option.value]: { x, width: w } }));
                  },
                }
              : {})}
            style={
              hug
                ? {
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: t.space.rowPadH,
                  }
                : {
                    flex: fit.weights[at] ?? 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: t.space.gap6,
                  }
            }
          >
            {/* One size for every segment, on one line: the labels shrink together, never one by
                one. Two lines only past the floor (a label longer than the whole track). */}
            <Text
              variant="segment"
              tone={selected ? 'ink' : 'inkSecondary'}
              {...(selected && ink ? { color: t.color.onInkSurface } : {})}
              align="center"
              numberOfLines={hug ? 1 : 2}
              style={labelSize}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Off screen and unconstrained, so each label measures its one-line width.
  measure: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 4000,
    opacity: 0,
    alignItems: 'flex-start',
  },
});
