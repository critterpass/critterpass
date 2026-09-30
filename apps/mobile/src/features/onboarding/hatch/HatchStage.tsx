/**
 * The hatch's picture at one moment of the design clock: navy, the halftone glow, the egg, Tokek
 * waving, three sparks and the wordmark, laid out around the screen centre like the design's phone.
 * Its first frame is the native launch screen: the glow and egg are the same images the launch
 * screen is baked from (tools/design-renders/export-app-icons.mjs), drawn at the same centred
 * geometry, so the hand-off shows nothing moving. Purely visual: never touchable, hidden from
 * assistive tech (the screen underneath carries the meaning).
 */
import { Image, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { LoopTransform } from '@/motion/presets';
import { Icon } from '@/ui/icons/Icon';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import ANDROID_EGG from '../../../../assets/splash-android-wobble/splash_egg_wobble_00.png';
import IOS_EGG from '../../../../assets/splash-egg.png';
import GLOW from '../../../../assets/splash-glow.png';
import {
  EGG,
  LAYOUT,
  SPARKS,
  TOKEK,
  TOKEK_WIGGLE,
  TOKEK_WIGGLE_MS,
  WORDMARK,
  sampleLoop,
  sampleTrack,
  type SparkSpec,
} from './timeline';

/** Android's system splash shows the egg alone; the glow joins it as the egg bursts. */
const GLOW_FADES_IN = Platform.OS === 'android';
const EGG_IMAGE = Platform.OS === 'android' ? ANDROID_EGG : IOS_EGG;
const EGG_BOX =
  Platform.OS === 'android'
    ? {
        left: -LAYOUT.androidEgg.size / 2,
        top: -LAYOUT.androidEgg.size / 2,
        size: LAYOUT.androidEgg.size,
      }
    : LAYOUT.egg;

function transformStyle({ tx, ty, r, sx, sy, o }: LoopTransform) {
  'worklet';
  return {
    opacity: o,
    transform: [
      { translateX: tx },
      { translateY: ty },
      { rotate: `${r}deg` },
      { scaleX: sx },
      { scaleY: sy },
    ],
  };
}

/** A bundled image with no load fade and no blank first frame (`defaultSource` decodes eagerly). */
function StillImage({ source, size }: { readonly source: number; readonly size: number }) {
  return (
    <Image
      source={source}
      defaultSource={source}
      fadeDuration={0}
      style={{ width: size, height: size }}
    />
  );
}

function Spark({ spec, clock }: { readonly spec: SparkSpec; readonly clock: SharedValue<number> }) {
  const theme = useTheme();
  const style = useAnimatedStyle(() => transformStyle(sampleTrack(spec.track, clock.value)));
  const accent = spec.accent === 'green' ? theme.color.green.base : theme.color[spec.accent];
  return (
    <Animated.View style={[styles.at, { left: spec.left, top: spec.top }, style]}>
      <Icon
        name="spark"
        size={spec.size}
        accent={accent}
        color={theme.color.paper.ink}
        decorative
      />
    </Animated.View>
  );
}

export interface HatchStageProps {
  /** Milliseconds on the design's hatch clock (./timeline). */
  readonly clock: SharedValue<number>;
  readonly testID?: string;
}

export function HatchStage({ clock, testID }: HatchStageProps) {
  const theme = useTheme();
  const egg = useAnimatedStyle(() => transformStyle(sampleTrack(EGG, clock.value)));
  const glow = useAnimatedStyle(() => {
    if (!GLOW_FADES_IN) return { opacity: 1 };
    // In as the egg bursts: its opacity falls from 1 to 0 over the same stretch.
    return { opacity: 1 - sampleTrack(EGG, clock.value).o };
  });
  const tokek = useAnimatedStyle(() => transformStyle(sampleTrack(TOKEK, clock.value)));
  const wave = useAnimatedStyle(() =>
    transformStyle(sampleLoop(TOKEK_WIGGLE, TOKEK_WIGGLE_MS, clock.value)),
  );
  const wordmark = useAnimatedStyle(() => transformStyle(sampleTrack(WORDMARK, clock.value)));
  const { glow: glowBox, tokek: tokekBox } = LAYOUT;

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.centre, { backgroundColor: theme.color.ink['850'] }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <View style={styles.anchor}>
        <Animated.View
          style={[styles.at, { left: -glowBox.size / 2, top: -glowBox.size / 2 }, glow]}
        >
          <StillImage source={GLOW} size={glowBox.size} />
        </Animated.View>
        <Animated.View style={[styles.at, { left: EGG_BOX.left, top: EGG_BOX.top }, egg]}>
          <StillImage source={EGG_IMAGE} size={EGG_BOX.size} />
        </Animated.View>
        <Animated.View style={[styles.at, { left: tokekBox.left, top: tokekBox.top }, tokek]}>
          <Animated.View style={wave}>
            <Sticker kind="gecko" name="Tokek" pose="wave" seed={41} size={tokekBox.size} />
          </Animated.View>
        </Animated.View>
        {SPARKS.map((spec) => (
          <Spark key={`${spec.left}:${spec.top}`} spec={spec} clock={clock} />
        ))}
        <Animated.View style={[styles.wordmark, { top: LAYOUT.wordmarkTop }, wordmark]}>
          <Text variant="displayHero" color={theme.color.yellow} style={styles.line}>
            CRITTER
          </Text>
          <Text variant="displayHero" color={theme.color.yellow} style={styles.line}>
            PASS
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  /** The screen centre: every layer is placed from here, like the design's zero-size anchor. */
  anchor: { width: 0, height: 0 },
  at: { position: 'absolute' },
  /** Wide enough for the wordmark at any Dynamic Type step it allows, centred on the anchor. */
  wordmark: { position: 'absolute', left: -200, width: 400, alignItems: 'center' },
  line: { textAlign: 'center' },
});
