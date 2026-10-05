/**
 * One change of a redraft: the old line struck through, the new time and place under it, the
 * guide's reason, and a check that keeps it (tap to leave this one as it was). Cards tick in one
 * after another: the strike draws left to right, the new line fades up, then the check pops.
 */
import { tokens } from '@cp/design-tokens';
import { plural, t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { impact } from '@/motion';
import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Icon } from '@/ui/icons/Icon';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { clock } from '../data/format';
import type { CardLine, ChangeCard as ChangeCardModel } from '../data/redraft';

export const CARD_STEP_MS = 620;
const STRIKE_MS = 260;
const RISE_MS = 240;
const POP_MS = 200;
const MARK = 26;
const standard = bezierEasing(tokens.motion.easing.standard);
const back = bezierEasing(tokens.motion.easing.back);

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    flexDirection: 'row',
    gap: th.space['12'],
  },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    marginStart: -th.space['8'],
    marginTop: -th.space['8'],
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: th.space['8'],
  },
  text: { flex: 1, gap: th.space['4'] },
  old: { alignSelf: 'flex-start' },
  strike: {
    position: 'absolute',
    start: 0,
    top: '50%',
    height: 1.5,
    backgroundColor: th.semantic.text.secondary,
  },
}));

function lineText(line: CardLine, locale: string, tz: string): string {
  const at = clock(locale, line.startsAt, tz);
  const name = line.name;
  return name === '' ? at : `${at} ${name}`;
}

export interface ChangeCardProps {
  readonly card: ChangeCardModel;
  readonly index: number;
  readonly kept: boolean;
  readonly locale: string;
  readonly tz: string;
  readonly onToggle: () => void;
}

export function ChangeCard({ card, index, kept, locale, tz, onToggle }: ChangeCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const [oldWidth, setOldWidth] = useState(0);
  const strike = useSharedValue(reduced ? 1 : 0);
  const rise = useSharedValue(reduced ? 1 : 0);
  const pop = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    const start = index * CARD_STEP_MS;
    strike.value = withDelay(start, withTiming(1, { duration: STRIKE_MS, easing: standard }));
    rise.value = withDelay(
      start + STRIKE_MS,
      withTiming(1, { duration: RISE_MS, easing: standard }),
    );
    pop.value = withDelay(
      start + STRIKE_MS + RISE_MS,
      withSequence(
        withTiming(1.2, { duration: POP_MS, easing: back }),
        withTiming(1, { duration: POP_MS / 2 }),
      ),
    );
    const timer = setTimeout(() => impact('tick'), start + STRIKE_MS + RISE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [index, reduced]);
  const strikeStyle = useAnimatedStyle(() => ({ width: oldWidth * strike.value }));
  const riseStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: (1 - rise.value) * 8 }],
  }));
  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value),
    transform: [{ scale: pop.value }],
  }));

  const before =
    card.kind === 'change' && card.before !== null ? lineText(card.before, locale, tz) : null;
  const shifted = card.kind === 'shifts' ? card.count : 0;
  const maxMin = card.kind === 'shifts' ? card.maxMin : 0;
  const movedTo = card.kind === 'change' ? (card.movedToDay ?? 0) : 0;
  const after =
    card.kind === 'shifts'
      ? t({
          id: 'planDraft.change.shifts',
          message: plural(shifted, {
            one: `One stop moves by up to ${maxMin} min`,
            other: `# stops move by up to ${maxMin} min`,
          }),
        })
      : card.movedToDay !== null
        ? t({ id: 'planDraft.change.movedToDay', message: `Moved to day ${movedTo}` })
        : card.after !== null
          ? lineText(card.after, locale, tz)
          : t({ id: 'planDraft.change.dropped', message: 'Taken out' });
  const reason = card.kind === 'change' ? card.reason : null;
  const toggleLabel = kept
    ? t({ id: 'planDraft.change.keep', message: 'Keep this change' })
    : t({ id: 'planDraft.change.skip', message: 'Leave this one as it was' });
  return (
    <View style={styles.card} testID={`redraft-change-${index}`}>
      <Pressable
        style={styles.toggle}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: kept }}
        accessibilityLabel={[after, toggleLabel].join(', ')}
        testID={`redraft-change-toggle-${index}`}
      >
        <Animated.View
          style={[
            styles.mark,
            kept
              ? { backgroundColor: theme.semantic.state.success }
              : { borderWidth: 2, borderColor: theme.semantic.border.control },
            popStyle,
          ]}
        >
          {kept ? (
            <Icon name="check" size={16} color={theme.semantic.text.onAccent} decorative />
          ) : null}
        </Animated.View>
      </Pressable>
      <View style={[styles.text, kept ? null : { opacity: 0.5 }]}>
        {before === null ? null : (
          <View
            style={styles.old}
            onLayout={(event) => setOldWidth(event.nativeEvent.layout.width)}
          >
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {before}
            </Text>
            <Animated.View style={[styles.strike, strikeStyle]} />
          </View>
        )}
        <Animated.View style={riseStyle}>
          <Text variant="title">{after}</Text>
        </Animated.View>
        {reason === null ? null : (
          <Animated.View style={riseStyle}>
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {reason}
            </Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}
