/**
 * The drafting checklist: one row per real job step. Rows rise in one after another (ty 14 → 0,
 * 600 ms apart); a finished step ticks green with what it found, the running one and those still
 * to come sit dimmed behind a dashed ring, and a failed step shows why under its line.
 */
import { tokens } from '@cp/design-tokens';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Icon } from '@/ui/icons/Icon';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { StepRow } from '../data/job';
import { failLine, stepLine } from './step-copy';

const RISE_PT = 14;
const RISE_STAGGER_MS = 600;
const MARK = 22;
const enter = bezierEasing(tokens.motion.easing.enter);

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['16'],
    paddingVertical: th.space['14'],
    gap: th.space['12'],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: th.space['10'] },
  text: { flex: 1, gap: th.space['2'] },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashed: { borderWidth: 2, borderStyle: 'dashed' },
}));

function useRise(index: number) {
  const reduced = useReducedImpactMotion();
  const y = useSharedValue(reduced ? 0 : RISE_PT);
  const opacity = useSharedValue(0);
  useEffect(() => {
    const delay = index * RISE_STAGGER_MS;
    const timing = { duration: tokens.motion.duration.medium, easing: enter };
    opacity.value = withDelay(delay, withTiming(1, timing));
    if (!reduced) y.value = withDelay(delay, withTiming(0, timing));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [index, reduced]);
  return useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));
}

function Mark({ status }: { readonly status: StepRow['status'] }) {
  const styles = useStyles();
  const theme = useTheme();
  if (status === 'done') {
    return (
      <View style={[styles.mark, { backgroundColor: theme.semantic.state.success }]}>
        <Icon name="check" size={14} color={theme.semantic.text.onAccent} decorative />
      </View>
    );
  }
  if (status === 'failed') {
    return (
      <View style={[styles.mark, { backgroundColor: theme.semantic.state.urgent }]}>
        <Text variant="label" color={theme.semantic.text.onAccent}>
          ✕
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.mark, styles.dashed, { borderColor: theme.semantic.state.warning }]} />
  );
}

function TaskRow({ row, index }: { readonly row: StepRow; readonly index: number }) {
  const styles = useStyles();
  const theme = useTheme();
  const rise = useRise(index);
  const settled = row.status === 'done' || row.status === 'failed';
  return (
    <Animated.View style={[styles.row, rise]} testID={`drafting-step-${row.id}`}>
      <Mark status={row.status} />
      <View style={styles.text}>
        <Text
          variant="body"
          color={settled ? theme.semantic.text.primary : theme.semantic.text.secondary}
        >
          {stepLine(row)}
        </Text>
        {row.status === 'failed' ? (
          <Text variant="caption" color={theme.semantic.state.urgent} testID="drafting-step-reason">
            {failLine(row.reason)}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

export function TaskList({ rows }: { readonly rows: readonly StepRow[] }) {
  const styles = useStyles();
  return (
    <View style={styles.card} accessibilityRole="list" testID="drafting-steps">
      {rows.map((row, index) => (
        <TaskRow key={row.id} row={row} index={index} />
      ))}
    </View>
  );
}
