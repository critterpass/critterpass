/**
 * The redraft's measured effect under its changes, all computed by the planner: time travelling,
 * pace, must-dos kept and, when it moved, the cost each.
 */
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme, type Theme } from '@/ui/theme';

import { estimateMoney } from '../data/format';
import type { MetricChip } from '../data/redraft';

const useStyles = makeStyles((th) => ({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
  chip: {
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
  },
}));

function words(chip: MetricChip, locale: string): string {
  switch (chip.kind) {
    case 'transit': {
      const minutes = Math.abs(chip.deltaMin);
      if (chip.deltaMin < 0) {
        return t({ id: 'planDraft.metric.transitLess', message: `${minutes} min less travelling` });
      }
      if (chip.deltaMin > 0) {
        return t({ id: 'planDraft.metric.transitMore', message: `${minutes} min more travelling` });
      }
      return t({ id: 'planDraft.metric.transitSame', message: 'Same time travelling' });
    }
    case 'pace':
      return chip.pace === 'slower'
        ? t({ id: 'planDraft.metric.slower', message: 'Slower pace' })
        : chip.pace === 'faster'
          ? t({ id: 'planDraft.metric.fuller', message: 'Fuller pace' })
          : t({ id: 'planDraft.metric.samePace', message: 'Same pace' });
    case 'must_dos': {
      const kept = chip.kept;
      const total = chip.total;
      return kept === total
        ? t({
            id: 'planDraft.metric.allKept',
            message: plural(total, { one: 'Must-do kept', other: 'All # must-dos kept' }),
          })
        : t({ id: 'planDraft.metric.someKept', message: `${kept} of ${total} must-dos kept` });
    }
    case 'cost': {
      // The change is all the server sends (no before and after), so it is rounded as an estimate
      // itself rather than taken between two rounded figures.
      const amount = estimateMoney(locale, Math.abs(chip.deltaMinor), chip.currency);
      return chip.deltaMinor < 0
        ? t({ id: 'planDraft.metric.cheaper', message: `${amount} less each` })
        : t({ id: 'planDraft.metric.dearer', message: `${amount} more each` });
    }
  }
}

function colour(theme: Theme, chip: MetricChip): string {
  switch (chip.kind) {
    case 'transit':
      return chip.deltaMin > 0 ? theme.color.orange : theme.color.blue;
    case 'pace':
      return theme.color.paper.base;
    case 'must_dos':
      return chip.kept === chip.total ? theme.color.green.base : theme.color.orange;
    case 'cost':
      return chip.deltaMinor > 0 ? theme.color.orange : theme.color.yellow;
  }
}

export function MetricChips({
  chips,
  locale,
}: {
  readonly chips: readonly MetricChip[];
  readonly locale: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  if (chips.length === 0) return null;
  return (
    <View style={styles.wrap} testID="redraft-metrics">
      {chips.map((chip) => (
        <View key={chip.kind} style={[styles.chip, { backgroundColor: colour(theme, chip) }]}>
          <Text variant="label" color={theme.semantic.text.onAccent}>
            {words(chip, locale)}
          </Text>
        </View>
      ))}
    </View>
  );
}
