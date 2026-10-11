/**
 * The crew pass (3.08, 3.13, 3.12's crest): a little book in the crew's cover colour with its
 * sticker in a crest, the name in capitals and a seat per member (dashed seats wait for the rest).
 * The sticker slaps in when it changes (Lively), the cover recolours (Smooth) and the closed pass
 * idles with a slow bob; Reduce Motion keeps it still and swaps by a short fade. `back` draws the
 * pass turned over: the crew code and who is in.
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour values, never copy. */
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { CrewCover } from '@cp/domain';

import {
  Avatar,
  CritterSticker,
  REDUCED_FADE,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { guideSticker } from '@/ui/avatar/guides';

import { passInk } from '../crew-look';

export interface PassSeat {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

export interface CrewPassProps {
  readonly name: string;
  readonly cover: CrewCover;
  /** The crew's sticker (a guide slug). */
  readonly art: string | null;
  readonly seats: readonly PassSeat[];
  /** Dashed seats after the real ones. @default 5 */
  readonly emptySeats?: number;
  /** Idle bob while nothing is being edited. @default true */
  readonly idle?: boolean;
  /** Shows the back of the pass: code and members. */
  readonly back?: { readonly code: string | null } | null;
  readonly testID?: string;
}

const WIDTH = 230;
const HEIGHT = 226;
const BOB_MS = 4800;

export function CrewPass({
  name,
  cover,
  art,
  seats,
  emptySeats = 5,
  idle = true,
  back = null,
  testID,
}: CrewPassProps) {
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const look = passInk(cover);
  const sticker = guideSticker(art);
  const fill = useSharedValue(look.fill);
  const slap = useSharedValue(1);
  const bob = useSharedValue(0);

  useEffect(() => {
    fill.value = reduced
      ? withTiming(look.fill, REDUCED_FADE)
      : withSpring(look.fill, SPRINGS.smooth);
  }, [look.fill, reduced, fill]);

  useEffect(() => {
    if (reduced) return;
    slap.value = 1.25;
    slap.value = withSpring(1, SPRINGS.lively);
  }, [art, reduced, slap]);

  useEffect(() => {
    if (reduced || !idle) {
      bob.value = withTiming(0, REDUCED_FADE);
      return;
    }
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: BOB_MS / 2, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: BOB_MS / 2, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [reduced, idle, bob]);

  const book = useAnimatedStyle(() => ({
    backgroundColor: fill.value,
    transform: [{ translateY: -5 * bob.value }, { rotate: `${-4 + bob.value}deg` }],
  }));
  const crest = useAnimatedStyle(() => ({
    transform: [{ scale: slap.value }, { rotate: `${(slap.value - 1) * -32}deg` }],
  }));

  const filled = seats.slice(0, 6);
  const open = Math.max(0, emptySeats - Math.max(0, filled.length - 1));

  return (
    <Animated.View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t({ id: 'crew.premium.pass.a11y', message: `Crew pass for ${name}` })}
      style={[styles.book, book]}
    >
      <View
        pointerEvents="none"
        style={[styles.frame, { borderColor: look.ink, opacity: look.light ? 0.35 : 0.55 }]}
      />
      {back === null ? (
        <View style={styles.face}>
          <Text variant="tier" color={look.ink} style={styles.kicker}>
            {t({ id: 'crew.premium.pass.kicker', message: 'CREW PASS' })}
          </Text>
          <Animated.View style={[styles.crest, crest]}>
            <View style={[styles.crestDisc, { backgroundColor: th.accent.stickerEdge }]} />
            <CritterSticker kind={sticker.kind} seed={sticker.seed} name={sticker.name} size={78} />
          </Animated.View>
          <Text
            variant="stampWord"
            color={look.ink}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={styles.name}
          >
            {name.toLocaleUpperCase()}
          </Text>
          <View style={styles.seats}>
            {filled.map((seat) => (
              <View key={seat.id} style={[styles.seat, { borderColor: look.fill }]}>
                <Avatar name={seat.name} color={seat.color} size={18} />
              </View>
            ))}
            {Array.from({ length: open }, (_, i) => (
              <View key={`open-${String(i)}`} style={[styles.open, { borderColor: look.ink }]} />
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.face}>
          <Text variant="tier" color={look.ink} style={styles.kicker}>
            {t({ id: 'crew.premium.pass.code', message: 'CREW CODE' })}
          </Text>
          <Text variant="stat" color={look.ink} style={styles.code}>
            {back.code ?? '······'}
          </Text>
          <View style={styles.seats}>
            {filled.map((seat) => (
              <Avatar key={seat.id} name={seat.name} color={seat.color} size={24} />
            ))}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  book: {
    width: WIDTH,
    height: HEIGHT,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderTopRightRadius: 26,
    borderBottomRightRadius: 26,
    boxShadow:
      'inset 12px 0 0 rgba(0,0,0,.09), inset 0 1px 0 rgba(255,255,255,.35), 0 2px 4px rgba(20,22,40,.12), 0 30px 50px -18px rgba(20,22,40,.45)',
  },
  frame: {
    position: 'absolute',
    top: 10,
    right: 10,
    bottom: 10,
    left: 22,
    borderWidth: 1.5,
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
  },
  face: {
    flex: 1,
    paddingLeft: 30,
    paddingRight: 18,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: { letterSpacing: 3.2 },
  crest: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestDisc: { ...StyleSheet.absoluteFill, borderRadius: 46, opacity: 0.24 },
  name: { letterSpacing: 1.2 },
  seats: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  seat: { borderWidth: 1.5, borderRadius: 11 },
  open: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderStyle: 'dashed' },
  code: { letterSpacing: 4 },
});
