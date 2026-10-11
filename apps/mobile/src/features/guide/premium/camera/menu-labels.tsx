/**
 * Point and ask's translations stuck to the menu (5.16): one sticker tag per dish over its own line
 * of the still, tipped a few degrees and cycling sun, tangerine, pink and mint; a dish that clashes
 * with someone's flags is pink and shakes once as it lands; the crew it was checked for hang
 * underneath as small chips.
 */
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import {
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
  type PremiumTheme,
} from '@/ui/premium';

import type { MenuFlag, MenuSticker, MenuStill } from '../../camera/menu-scan';
import { MENU_PAINT } from '../guide-paint';

const TILTS = [-2, -5, -3, -7] as const;
const SHAKE = 3;

const useStyles = makePremiumStyles((th) => ({
  label: {
    position: 'absolute',
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: th.accent.stickerEdge,
    boxShadow: MENU_PAINT.labelShadow,
  },
  chips: { position: 'absolute', gap: 4, alignItems: 'flex-start' },
  chip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: th.accent.stickerEdge,
  },
}));

function tint(th: PremiumTheme, index: number): string {
  return (
    [th.accent.sun, th.accent.tangerine, th.accent.pink, th.accent.mint][index % 4] ?? th.accent.sun
  );
}

function flagLabel(flag: MenuFlag): string {
  return `${flag.member} ${flag.verdict === 'clash' ? '✕' : '✓'} ${flag.reason}`.trim();
}

function Label({ sticker, index }: { readonly sticker: MenuSticker; readonly index: number }) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const reduced = usePremiumReducedMotion();
  const tilt = TILTS[index % TILTS.length] ?? -3;
  const turn = useSharedValue(tilt);
  const clash = sticker.clash;
  useEffect(() => {
    if (!clash || reduced) return;
    turn.value = withSequence(
      withTiming(tilt - SHAKE, { duration: th.motion.reduceMotionFadeMs / 3 }),
      withTiming(tilt + SHAKE, { duration: th.motion.reduceMotionFadeMs / 3 }),
      withTiming(tilt, { duration: th.motion.reduceMotionFadeMs / 3 }),
    );
  }, [clash, reduced, turn, tilt, th.motion.reduceMotionFadeMs]);
  const shake = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  const left = `${Math.min(sticker.x + sticker.width * 0.35, 0.6) * 100}%` as const;
  return (
    <>
      <Animated.View
        accessible
        accessibilityRole="text"
        accessibilityLabel={[
          `${sticker.source}: ${sticker.translation}`,
          ...sticker.flags.map(flagLabel),
        ].join(', ')}
        style={[
          styles.label,
          {
            left,
            top: `${sticker.y * 100}%`,
            backgroundColor: clash ? th.accent.pink : tint(th, index),
          },
          shake,
        ]}
        testID={`guide-menu-sticker-${sticker.id}`}
      >
        <Text variant="badge" tone="onAccent">
          {sticker.translation}
        </Text>
      </Animated.View>
      {sticker.flags.length === 0 ? null : (
        <View style={[styles.chips, { left, top: `${(sticker.y + sticker.height * 1.6) * 100}%` }]}>
          {sticker.flags.map((flag) => (
            <View
              key={`${flag.member}-${flag.reason}`}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    flag.verdict === 'clash'
                      ? th.color.status.voteOpen.bg
                      : th.color.status.booked.bg,
                },
              ]}
              testID={`guide-menu-flag-${flag.verdict}`}
            >
              <Text
                variant="badge"
                color={
                  flag.verdict === 'clash'
                    ? th.color.status.voteOpen.text
                    : th.color.status.booked.text
                }
              >
                {flagLabel(flag)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

export function MenuLabels({
  still,
  stickers,
  children,
}: {
  readonly still: Pick<MenuStill, 'width' | 'height'>;
  readonly stickers: readonly MenuSticker[];
  readonly children: ReactNode;
}) {
  const ratio = still.height > 0 ? still.width / still.height : 0.75;
  const flagged = stickers.some((sticker) => sticker.flags.length > 0);
  return (
    <View
      style={{ width: '100%', aspectRatio: ratio, marginBottom: flagged ? 64 : 0 }}
      testID="guide-menu-still"
    >
      <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>{children}</View>
      {stickers.map((sticker, index) => (
        <Label key={sticker.id} sticker={sticker} index={index} />
      ))}
    </View>
  );
}
