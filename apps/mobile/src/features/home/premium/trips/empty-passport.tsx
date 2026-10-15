/**
 * No trips yet (3.06): an open passport whose first page waits for its stamp, idling on a slow
 * bob (still under Reduce Motion), "Your first stamp is waiting", the ink "Pitch a place" and a
 * glass "Join with a crew code" pill with six empty code cells.
 */
/* eslint-disable lingui/no-unlocalized-strings -- CSS gradients, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { paperGrain } from '@/features/monetize';
import { useIdleLoopRunning } from '@/motion/idle-pause';
import {
  Button,
  CritterSticker,
  GlassSurface,
  GuideNote,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

const BOB_MS = 2600;

const useStyles = makePremiumStyles((t) => ({
  root: { gap: t.space.gap16, paddingTop: t.space.gap8 },
  art: { height: 250, alignItems: 'center', justifyContent: 'center' },
  book: { flexDirection: 'row', width: 318, height: 206 },
  page: {
    flex: 1,
    backgroundColor: t.accent.paper,
    padding: 14,
    gap: 10,
    backgroundImage: paperGrain(260),
  },
  left: {
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    boxShadow: 'inset -10px 0 14px -10px rgba(23,20,42,.18), 0 18px 34px -16px rgba(20,22,40,.35)',
  },
  right: {
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    boxShadow: 'inset 10px 0 14px -10px rgba(23,20,42,.18), 0 18px 34px -16px rgba(20,22,40,.35)',
  },
  mono: { letterSpacing: 1, color: t.color.placeholder },
  stamp: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.stamp.pink.ring,
    opacity: 0.6,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-12deg' }],
  },
  stampText: { color: t.stamp.pink.text, textAlign: 'center' },
  slot: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.color.fieldBorder,
    borderRadius: 10,
  },
  gecko: { position: 'absolute', end: 34, bottom: -6 },
  join: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  cells: { flexDirection: 'row', gap: 4 },
  cell: {
    width: 22,
    height: 30,
    borderRadius: 7,
    backgroundColor: t.color.control,
    borderWidth: 1,
    borderColor: t.color.fieldBorder,
  },
}));

export interface EmptyPassportProps {
  readonly onPitch: () => void;
  readonly onJoin: () => void;
}

export function EmptyPassport({ onPitch, onJoin }: EmptyPassportProps) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const looping = useIdleLoopRunning(!reduced);
  const { t } = useLingui();
  const bob = useSharedValue(0);
  useEffect(() => {
    if (!looping) {
      cancelAnimation(bob);
      bob.value = 0;
      return;
    }
    bob.value = withRepeat(
      withTiming(1, { duration: BOB_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [bob, looping]);
  const idle = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * bob.value }, { rotate: `${-2 + bob.value}deg` }],
  }));
  return (
    <View style={styles.root} testID="trip-list-empty">
      <View
        style={[
          styles.art,
          {
            backgroundImage:
              'radial-gradient(circle at 50% 40%, rgba(255,216,74,.22) 0%, transparent 60%)',
          },
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={[styles.book, idle]}>
          <View style={[styles.page, styles.left]}>
            <Text variant="stampSmall" style={styles.mono}>
              VISAS · STAMPS
            </Text>
            <View style={styles.stamp}>
              <Text variant="stampSmall" style={styles.stampText}>
                {t({ id: 'home.premium.trips.firstStamp', message: 'Your first stamp' })}
              </Text>
            </View>
          </View>
          <View style={[styles.page, styles.right]}>
            <View style={[styles.slot, { width: 72, height: 46 }]} />
            <View style={[styles.slot, { width: 50, height: 46, alignSelf: 'flex-end' }]} />
            <View style={[styles.slot, { width: 60, height: 46 }]} />
          </View>
        </Animated.View>
        <View style={styles.gecko}>
          <CritterSticker kind="gecko" name="Tokek" size={112} pose="point" />
        </View>
      </View>
      {/* Left-set a little in from the cards, as the design sets the words (3.06). */}
      <View style={{ gap: 6, paddingHorizontal: 8 }}>
        <Text variant="largeTitle" accessibilityRole="header">
          {t({ id: 'home.premium.trips.emptyTitle', message: 'Your first stamp is waiting' })}
        </Text>
        <Text variant="body" tone="muted">
          {t({
            id: 'home.premium.trips.emptyLine',
            message: 'Pitch a place to your crew, or join a crew that already has a trip going.',
          })}
        </Text>
      </View>
      <Button
        label={t({ id: 'home.premium.trips.pitch', message: '+ Pitch a place' })}
        onPress={onPitch}
        testID="trips-pitch"
      />
      <PressableScale
        onPress={onJoin}
        accessibilityLabel={t({ id: 'home.premium.trips.join', message: 'Join with a crew code' })}
        testID="trips-join-code"
      >
        <GlassSurface kind="regular" interactive style={styles.join}>
          <Text variant="headline">
            {t({ id: 'home.premium.trips.join', message: 'Join with a crew code' })}
          </Text>
          <View style={styles.cells}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.cell} />
            ))}
          </View>
        </GlassSurface>
      </PressableScale>
      <GuideNote
        name="Pon"
        critter="tanuki"
        tint="pon"
        text={t({
          id: 'home.premium.trips.ponNote',
          message: 'No crew yet? I can show you around a place while you decide.',
        })}
      />
      <View style={{ height: theme.space.gap8 }} />
    </View>
  );
}
