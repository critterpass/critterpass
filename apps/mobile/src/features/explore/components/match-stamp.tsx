/**
 * MATCH: the stamp that lands (with the thud) when enough of the crew said yes to a card, over a
 * line saying where the place goes next. A match that went to Ideas shows the faces of everyone who
 * said yes, then drops away toward Ideas and hands the deck back by itself; an earlier match names
 * the day it is suggested for and waits for a tap.
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { bezierEasing, patterns } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { AvatarStack, type StackMember } from '@/ui/people/AvatarStack';
import { Text } from '@/ui/text/Text';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

import type { MatchOutcome } from '../trip-explore/swipe-outcome';

export interface MatchStampProps {
  readonly placeName: string;
  /** The day the plan suggests for it; null when no slot was free. */
  readonly dayNo: number | null;
  /** Where the match went; absent reads `dayNo` (a suggested day, or a plain match). */
  readonly outcome?: MatchOutcome | undefined;
  /** Everyone who said yes (shown when the match went to Ideas). */
  readonly voters?: readonly StackMember[] | undefined;
  /** How long a match that went to Ideas holds before it drops away. */
  readonly holdMs?: number | undefined;
  readonly onDone: () => void;
}

/** How long the stamp holds before the match drops toward Ideas, and how long the drop takes. */
const HOLD_MS = 1400;
const DROP_MS = tokens.motion.duration.slow;
const DROP_BY = 320;
const dropEasing = bezierEasing(tokens.motion.easing.standard);

const useStyles = makeStyles((t) => ({
  veil: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space['16'],
    padding: t.space['24'],
    backgroundColor: t.semantic.bg.base,
    opacity: 0.94,
  },
  stamp: {
    borderWidth: t.space['4'],
    borderColor: t.semantic.state.success,
    borderRadius: t.radius.md,
    paddingHorizontal: t.space['20'],
    paddingVertical: t.space['8'],
    transform: [{ rotate: degrees(-8) }],
  },
  drop: { alignItems: 'center', gap: t.space['16'] },
}));

function useDropToIdeas(active: boolean, holdMs: number, onDone: () => void) {
  const reduced = useReducedImpactMotion();
  const offset = useSharedValue(0);
  const fade = useSharedValue(1);
  useEffect(() => {
    if (!active) return;
    const finish = (finished?: boolean) => {
      'worklet';
      if (finished === true) runOnJS(onDone)();
    };
    if (reduced) {
      fade.value = withDelay(holdMs, withTiming(0, { duration: DROP_MS }, finish));
      return;
    }
    offset.value = withDelay(
      holdMs,
      withTiming(DROP_BY, { duration: DROP_MS, easing: dropEasing }),
    );
    fade.value = withDelay(
      holdMs,
      withTiming(0, { duration: DROP_MS, easing: dropEasing }, finish),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs; the drop runs once per match.
  }, [active, holdMs, reduced]);
  return useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: offset.value }, { scale: 1 - (offset.value / DROP_BY) * 0.5 }],
  }));
}

export function MatchStamp({
  placeName,
  dayNo: suggestedDay,
  outcome,
  voters,
  holdMs = HOLD_MS,
  onDone,
}: MatchStampProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const land = patterns.useStamp({ active: true });
  const result: MatchOutcome =
    outcome ??
    (suggestedDay === null ? { kind: 'match' } : { kind: 'suggested', dayNo: suggestedDay });
  const dayNo = result.kind === 'suggested' ? result.dayNo : 0;
  const toIdeas = result.kind === 'idea';
  const drop = useDropToIdeas(toIdeas, holdMs, onDone);
  const line =
    result.kind === 'idea'
      ? t({
          id: 'explore.swipe.matchIdea',
          message: `${placeName} is in Ideas, with everyone who said yes.`,
        })
      : result.kind === 'suggested'
        ? t({
            id: 'explore.swipe.matchSuggested',
            message: `${placeName} is suggested for Day ${dayNo}. The organiser okays it.`,
          })
        : t({
            id: 'explore.swipe.matchUnslotted',
            message: `${placeName} is a match. The plan has no free slot for it yet.`,
          });
  return (
    <Pressable
      style={styles.veil}
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'explore.swipe.matchDismiss', message: 'Keep swiping' })}
      onPress={onDone}
      testID="explore-swipe-match"
    >
      <Animated.View style={[styles.drop, toIdeas ? drop : null]}>
        <Animated.View style={land}>
          <View style={styles.stamp}>
            <Text variant="displayXl" color={theme.semantic.state.success}>
              {upper(t({ id: 'explore.swipe.match', message: 'Match' }), i18n.locale)}
            </Text>
          </View>
        </Animated.View>
        {toIdeas && voters !== undefined && voters.length > 0 ? (
          <View testID="explore-swipe-match-voters">
            <AvatarStack members={voters} max={5} />
          </View>
        ) : null}
        <Text variant="h3" style={{ textAlign: 'center' }}>
          {line}
        </Text>
      </Animated.View>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {t({ id: 'explore.swipe.matchTap', message: 'Tap to keep swiping' })}
      </Text>
    </Pressable>
  );
}
