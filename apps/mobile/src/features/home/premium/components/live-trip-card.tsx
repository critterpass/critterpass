/**
 * The live trip card (3.05): the place's photo full bleed, a clear-glass "Live now" chip with a
 * blinking mint dot, who is there, and a clear-glass panel with the name, "Day 4 of 8" and a tick
 * per day (past white, today sun, ahead faint) beside a white chevron. Zooms into the hub (1.05).
 */
/* eslint-disable lingui/no-unlocalized-strings -- CSS gradients, never copy. */
import { premium } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import {
  CritterSticker,
  CrewStack,
  GlassSurface,
  Icon,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
  type CrewMember,
} from '@/ui/premium';
import { ZoomLink } from '@/ui/premium/shell';

import { TripPhoto } from './trip-photo';

const useStyles = makePremiumStyles((t) => ({
  card: {
    height: 312,
    borderRadius: t.radius.hero,
    overflow: 'hidden',
    backgroundColor: t.color.control,
    boxShadow: '0 0 0 .5px rgba(20,22,40,.08), 0 30px 50px -24px rgba(20,22,40,.5)',
  },
  shade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage:
      'linear-gradient(180deg, rgba(10,12,20,.25) 0%, rgba(10,12,20,0) 30%, rgba(10,12,20,0) 55%, rgba(10,12,20,.35) 100%)',
  },
  top: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chip: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: t.accent.mint,
    boxShadow: `0 0 8px ${t.accent.mint}`,
  },
  white: { color: t.material.clear.foreground },
  panel: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    height: 96,
    borderRadius: 26,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  grow: { flex: 1, gap: 3 },
  name: { fontWeight: '800', letterSpacing: -1.2, color: t.material.clear.foreground },
  sub: { color: t.material.clear.foreground, opacity: 0.85 },
  ticks: { flexDirection: 'row', gap: 4, marginTop: 4 },
  tick: { width: 18, height: 4, borderRadius: 2 },
  chevron: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.material.clear.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gecko: { position: 'absolute', end: 20, top: 118, transform: [{ rotate: '8deg' }] },
}));

const BLINK_MS = 800;
/** Day ticks sit on the trip photo, so they stay white in both modes. */
const ON_PHOTO = premium.modes.light.color;

function BlinkDot() {
  const styles = useStyles();
  const reduced = usePremiumReducedMotion();
  const on = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    on.value = withRepeat(withTiming(0.25, { duration: BLINK_MS }), -1, true);
  }, [on, reduced]);
  const blink = useAnimatedStyle(() => ({ opacity: on.value }));
  return <Animated.View style={[styles.dot, blink]} />;
}

export interface LiveTripCardProps {
  readonly tripId: string;
  readonly place: string;
  readonly slug: string | null;
  readonly guideKind: string;
  readonly day: number;
  readonly days: number;
  readonly members: readonly CrewMember[];
}

export function LiveTripCard({
  tripId,
  place,
  slug,
  guideKind,
  day,
  days,
  members,
}: LiveTripCardProps) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const line = t({ id: 'home.premium.live.day', message: `Day ${day} of ${days}` });
  return (
    <ZoomLink
      href={`/hub/${tripId}`}
      zoomId={`trip-${tripId}`}
      accessibilityLabel={`${place}, ${line}`}
      testID={`trip-list-row-${tripId}`}
    >
      <View style={styles.card}>
        <TripPhoto slug={slug} />
        <View style={styles.shade} />
        <View style={styles.top}>
          <GlassSurface kind="clear" style={styles.chip}>
            <BlinkDot />
            <Text variant="caption" style={styles.white}>
              {t({ id: 'home.premium.live.now', message: 'Live now' })}
            </Text>
          </GlassSurface>
          {members.length === 0 ? null : (
            <CrewStack
              members={members}
              size={28}
              max={4}
              accessibilityLabel={t({ id: 'home.premium.live.who', message: 'Who is there' })}
            />
          )}
        </View>
        <View style={styles.gecko} pointerEvents="none">
          <CritterSticker kind={guideKind} name={place} size={78} pose="cheer" />
        </View>
        <GlassSurface kind="clear" style={styles.panel}>
          <View style={styles.grow}>
            <Text variant="largeTitle" numberOfLines={1} adjustsFontSizeToFit style={styles.name}>
              {place}
            </Text>
            <Text variant="note" style={styles.sub} numberOfLines={1}>
              {line}
            </Text>
            <View style={styles.ticks}>
              {Array.from({ length: Math.min(days, 14) }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.tick,
                    {
                      backgroundColor:
                        i + 1 < day
                          ? ON_PHOTO.onInk
                          : i + 1 === day
                            ? theme.accent.sun
                            : ON_PHOTO.spinnerTrack,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
          <View style={styles.chevron}>
            <Icon name="forward" size={20} color={theme.color.onAccent} />
          </View>
        </GlassSurface>
      </View>
    </ZoomLink>
  );
}
