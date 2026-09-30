/**
 * One day of the trip plan (3e-1): coloured number tile with the weekday, the day's title and a
 * one-line summary, and the trailing chip. A day the guide changed since I last looked gets one
 * highlight sweep; a booked day refused a move shakes. Drag handling lives in `day-list.tsx`.
 */
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { DayChip, dayChipLabel } from './day-chip';
import type { DayCard as DayCardModel } from './model/plan-model';

export const DAY_CARD_HEIGHT = 68;
export const DAY_CARD_GAP = 10;

const TILE_COLOURS = [
  tokens.color.yellow,
  tokens.color.pink,
  tokens.color.blue,
  tokens.color.orange,
  tokens.color.green.base,
  tokens.color.paper.base,
];

export function dayTileColour(dayNo: number): string {
  return TILE_COLOURS[(dayNo - 1) % TILE_COLOURS.length] ?? tokens.color.yellow;
}

/** "Mon" for a local date, in the reader's language; empty while the date is open. */
export function weekdayOf(date: string | null, locale: string): string {
  if (date === null) return '';
  // Midday UTC keeps the calendar date in every zone.
  // eslint-disable-next-line lingui/no-unlocalized-strings
  const at = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(at);
}

const useStyles = makeStyles((th) => ({
  card: {
    height: DAY_CARD_HEIGHT,
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: th.space['6'],
    gap: th.space['12'],
    overflow: 'hidden',
  },
  today: { borderWidth: 2, borderColor: th.semantic.action.primary },
  tile: {
    width: 56,
    height: 56,
    borderRadius: th.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: th.space['2'] },
  sweep: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    width: 90,
    backgroundColor: th.semantic.action.primary,
    opacity: 0.22,
    transform: [{ skewX: SWEEP_SKEW }],
  },
}));

// One-off sweep, 600–800 ms (3e-1 motion).
const SWEEP_MS = tokens.motion.duration.extra;
const SHAKE_PT = 6;
// The sweep band's slant (a design constant, not copy).
// eslint-disable-next-line lingui/no-unlocalized-strings
const SWEEP_SKEW = '-18deg';
const SHAKE_STEP_MS = tokens.motion.duration.instant / 2;

function useSweep(active: boolean, onDone: () => void) {
  const x = useSharedValue(-120);
  const reduced = useReducedImpactMotion();
  useEffect(() => {
    if (!active) return undefined;
    x.value = -120;
    x.value = withTiming(420, { duration: reduced ? tokens.motion.duration.instant : SWEEP_MS });
    const timer = setTimeout(onDone, SWEEP_MS + 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- x is a stable shared value ref.
  }, [active, reduced]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { skewX: SWEEP_SKEW }] }));
}

export function useShake(trigger: number) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (trigger === 0) return;
    x.value = withSequence(
      withTiming(-SHAKE_PT, { duration: SHAKE_STEP_MS }),
      withTiming(SHAKE_PT, { duration: SHAKE_STEP_MS }),
      withTiming(-SHAKE_PT / 2, { duration: SHAKE_STEP_MS }),
      withTiming(SHAKE_PT / 2, { duration: SHAKE_STEP_MS }),
      withTiming(0, { duration: SHAKE_STEP_MS }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- x is a stable shared value ref.
  }, [trigger]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
}

export interface DayCardProps {
  readonly card: DayCardModel;
  readonly sweep?: boolean;
  readonly onSwept?: () => void;
  /** Bumped to shake the card (a booked day refused a move). */
  readonly shake?: number;
}

function dayTitle(card: DayCardModel): string {
  return card.theme ?? card.summary[0] ?? t({ id: 'plan.overview.freeDay', message: 'Free day' });
}

function daySummary(card: DayCardModel): string {
  return card.summary.length > 0
    ? card.summary.join(' · ')
    : t({ id: 'plan.overview.freeDayLine', message: 'Nothing booked. On purpose.' });
}

/** What a screen reader says for the card. */
export function dayCardLabel(card: DayCardModel, locale: string): string {
  const dayNo = card.dayNo;
  return [
    t({ id: 'plan.overview.dayN', message: `Day ${dayNo}` }),
    weekdayOf(card.date, locale),
    dayTitle(card),
    daySummary(card),
    dayChipLabel(card.chip),
  ]
    .filter(Boolean)
    .join(', ');
}

/** The card's face; the list wraps it with the press, the drag and the accessibility actions. */
export function DayCard({ card, sweep = false, onSwept, shake = 0 }: DayCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const sweepStyle = useSweep(sweep, onSwept ?? (() => undefined));
  const shakeStyle = useShake(shake);
  const weekday = weekdayOf(card.date, locale);
  const dayNo = card.dayNo;
  return (
    <Animated.View style={shakeStyle}>
      <View
        style={[styles.card, card.when === 'today' ? styles.today : null]}
        testID={`plan-day-${dayNo}`}
      >
        <View style={[styles.tile, { backgroundColor: dayTileColour(dayNo) }]}>
          <Text variant="h3" color={theme.semantic.text.onAccent}>
            {String(dayNo)}
          </Text>
          {weekday === '' ? null : (
            <Text variant="label" color={theme.semantic.text.onAccent}>
              {upper(weekday, locale)}
            </Text>
          )}
        </View>
        <View style={styles.body}>
          <Text variant="title" numberOfLines={1}>
            {upper(dayTitle(card), locale)}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={1}>
            {daySummary(card)}
          </Text>
        </View>
        <View
          style={{ paddingRight: theme.space['8'] }}
          importantForAccessibility="no-hide-descendants"
        >
          <DayChip chip={card.chip} />
        </View>
        {sweep ? <Animated.View pointerEvents="none" style={[styles.sweep, sweepStyle]} /> : null}
      </View>
    </Animated.View>
  );
}
