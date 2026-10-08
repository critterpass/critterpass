/**
 * One day of the dates heatmap: a 40 pt cell tinted orange by how many of the crew are free
 * (.10 → 1.0 in six steps scaled to the crew), the date and "n/N" under it. Inside the chosen
 * range the tint gives way to the yellow band behind it and the ink turns dark, so the selection
 * reads at a glance while each day's count stays. Screen readers hear "{date}, {n} of {N} free",
 * whether it's selected, and which end of the range it is. A trip of one has nobody to count, so
 * its days carry no fraction; a day already past is a plain dimmed day in every case.
 */
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { deviceTier, isLowTier } from '@/motion';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { BandEdges } from './day-grid';
import { heatStep, type HeatDay } from './model';

const useStyles = makeStyles((th) => ({
  cell: {
    height: th.space['32'] + th.space['8'],
    borderRadius: th.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // A day button is drawn the size of a day (touch slop makes up the target), so the picker's
  // grid, bands and outline match the read-only calendar's.
  press: {
    height: th.space['32'] + th.space['8'],
    minHeight: th.space['32'] + th.space['8'],
    minWidth: 0,
  },
  fill: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 },
  closed: { opacity: 0.4 },
}));

/** "{date}, {n} of {N} free", with the range end it is. */
export function heatCellLabel(
  when: string,
  free: number,
  total: number,
  edges: BandEdges | null,
  counted = true,
): string {
  if (!counted) {
    if (edges?.first === true && edges.last) {
      return t({ id: 'setup.when.cellA11yOnlyPlain', message: `${when}, first and last day` });
    }
    if (edges?.first === true) {
      return t({ id: 'setup.when.cellA11yFirstPlain', message: `${when}, first day` });
    }
    if (edges?.last === true) {
      return t({ id: 'setup.when.cellA11yLastPlain', message: `${when}, last day` });
    }
    return when;
  }
  if (edges?.first === true && edges.last) {
    return t({
      id: 'setup.when.cellA11yOnly',
      message: `${when}, first and last day, ${free} of ${total} free`,
    });
  }
  if (edges?.first === true) {
    return t({
      id: 'setup.when.cellA11yFirst',
      message: `${when}, first day, ${free} of ${total} free`,
    });
  }
  if (edges?.last === true) {
    return t({
      id: 'setup.when.cellA11yLast',
      message: `${when}, last day, ${free} of ${total} free`,
    });
  }
  return t({ id: 'setup.when.cellA11y', message: `${when}, ${free} of ${total} free` });
}

export interface HeatCellProps {
  readonly day: HeatDay;
  readonly total: number;
  /** Where the day sits in the filled band, or null outside it. */
  readonly band: BandEdges | null;
  readonly label: string;
  /** Makes the day a button; days that can't be picked (before today) stay dimmed. */
  readonly onPress?: (() => void) | undefined;
  readonly closed?: boolean;
}

export function HeatCell({ day, total, band, label, onPress, closed = false }: HeatCellProps) {
  const styles = useStyles();
  const theme = useTheme();
  const inBand = band !== null;
  const everyone = total > 0 && day.free >= total;
  // A day already past has no heat: it is not a day anyone can be free on.
  const target = inBand || closed ? 0 : heatStep(day.free, total);
  const opacity = useSharedValue(target);
  useEffect(() => {
    // The band shows at once; heat steps ease as each calendar lands (low-tier phones just switch).
    opacity.value =
      inBand || isLowTier(deviceTier)
        ? target
        : withTiming(target, { duration: tokens.motion.duration.base });
  }, [target, inBand, opacity]);
  const fillStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const ink = inBand || everyone ? theme.semantic.text.onAccent : theme.semantic.text.primary;
  const pressable = onPress !== undefined && !closed;
  const face = (
    <View
      style={[styles.cell, closed ? styles.closed : null]}
      accessible={!pressable}
      accessibilityLabel={pressable ? undefined : label}
      accessibilityState={pressable ? undefined : { selected: inBand }}
      testID={`heat-${day.date}`}
    >
      <Animated.View style={[styles.fill, { backgroundColor: theme.color.orange }, fillStyle]} />
      <Text variant="title" color={ink}>
        {String(day.day)}
      </Text>
      {closed || total <= 1 ? null : (
        <Text variant="caption" color={ink}>
          {`${day.free}/${total}`}
        </Text>
      )}
    </View>
  );
  if (!pressable) return face;
  return (
    <PressScale
      onPress={onPress}
      widthClass="narrow"
      style={styles.press}
      accessibilityLabel={label}
      accessibilityState={{ selected: inBand }}
      testID={`heat-pick-${day.date}`}
    >
      {face}
    </PressScale>
  );
}
