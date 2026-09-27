/**
 * A single POI pin: a hand-drawn capsule (category icon + name), enlarged with a yellow outline
 * when selected (map spec "Pins"). Rendered inside a `ViewAnnotation` by `CpMap` at a place's
 * lat/lng — this component itself is plain React (no MapLibre native dependency), which is what
 * lets it be unit-tested with React Native Testing Library instead of a real map engine.
 *
 * Takes an already-resolved `iconKey`/`categoryLabel` rather than a `PoiCategory` enum: the
 * `mobile-ui` layer may not depend on `@cp/domain` (tools/lint/boundaries.js) — the taxonomy →
 * icon/label mapping (`CATEGORY_ICON_KEYS`) lives in the `mobile-data` layer that has real place
 * data to map (`apps/mobile/src/data/places`, T7b).
 *
 * Entrance: drops in over ~420 ms with a 70 ms stagger (`index` prop), spring `bouncy`
 * (stiffness 350 / damping 21 / 11% overshoot — packages/design-tokens `motion.spring.bouncy`).
 * Reduce Motion (`useReducedMotion`, real device/simulator setting, not a prop the caller must
 * remember to pass) replaces the drop with a plain fade (design-system.md §4: "reduce-motion =
 * fade only").
 */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const STAGGER_MS = 70;

// `motion.spring.bouncy` is typed as a union with the token schema's `easingDuration` spring kind
// (used by other, non-physical tokens); this one is always authored as `physical` (verified
// against packages/design-tokens/src/motion.tokens.json), so this narrows once here instead of
// asserting at every call site.
const bouncySpring = tokens.motion.spring.bouncy;
const BOUNCY_SPRING_PHYSICAL =
  bouncySpring.kind === 'physical'
    ? { stiffness: bouncySpring.stiffness, damping: bouncySpring.damping, mass: bouncySpring.mass }
    : { stiffness: 350, damping: 21, mass: 1 };

export interface DoodlePinProps {
  readonly name: string;
  /** `CATEGORY_ICON_KEYS[category]` — a stable sprite key, e.g. `"pin-food"`. */
  readonly iconKey: string;
  /** Human-readable category, e.g. `"Food"` — already localised by the caller. */
  readonly categoryLabel: string;
  readonly selected?: boolean;
  /** Stagger index among the pins dropping in together (0 = no delay). */
  readonly index?: number;
  readonly onPress?: () => void;
}

export function DoodlePin({
  name,
  iconKey,
  categoryLabel,
  selected = false,
  index = 0,
  onPress,
}: DoodlePinProps) {
  const { t } = useLingui();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    const delay = index * STAGGER_MS;
    progress.value = reduceMotion
      ? withDelay(delay, withTiming(1, { duration: tokens.motion.duration.fast }))
      : withDelay(delay, withSpring(1, BOUNCY_SPRING_PHYSICAL));
    // Only the entrance depends on these; `progress` is a stable shared value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: progress.value };
    return {
      opacity: progress.value,
      transform: [
        { translateY: (1 - progress.value) * -16 },
        { scale: 0.6 + progress.value * 0.4 },
      ],
    };
  });

  const label = t({
    id: 'map.doodlePin.accessibilityLabel',
    // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
    message: `${{ name }}, ${{ categoryLabel }}`,
  });

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        testID={`doodle-pin-${iconKey}`}
        style={[styles.capsule, selected ? styles.selected : null]}
      >
        <View style={styles.iconDot} testID={`doodle-pin-icon-${iconKey}`} />
        <Text style={styles.label} numberOfLines={1}>
          {name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: tokens.color.ink[800],
    borderWidth: 1,
    borderColor: tokens.color.ink[600],
  },
  selected: {
    borderColor: tokens.color.yellow,
    borderWidth: 2,
    transform: [{ scale: 1.15 }],
  },
  iconDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: tokens.color.paper.base,
  },
  label: {
    color: tokens.color.paper.base,
    fontSize: tokens.type.caption.fontSize,
    maxWidth: 140,
  },
});
