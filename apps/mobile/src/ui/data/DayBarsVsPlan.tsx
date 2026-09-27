import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { Columns } from './MonthBars';

export interface DaySpend {
  /** Axis label ("Mon", or a short day number). */
  readonly label: string;
  /** Spent so far as a fraction of the chart's top value; omit for days still ahead. */
  readonly actual?: number;
  /** Planned spend as a fraction of the chart's top value (dashed line). */
  readonly plan: number;
  /** Pre-formatted spoken amounts for the summary ("$640 of $900 planned"). */
  readonly amountLabel: string;
  readonly today?: boolean;
}

export interface DayBarsVsPlanProps {
  readonly days: readonly DaySpend[];
  /** Heading ("By day"). */
  readonly title: string;
  /** End-aligned legend ("Dashes = plan"). */
  readonly legend?: string;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['16'],
  },
}));

/** Daily spend columns against the plan: over-plan days pink, future days empty track. */
export function DayBarsVsPlan({ days, title, legend, testID }: DayBarsVsPlanProps) {
  const styles = useStyles();
  const theme = useTheme();
  const over = t({ id: 'common.data.overPlan', message: 'over plan' });
  const todayWord = t({ id: 'common.data.today', message: 'today' });
  const parts = days.map((day) => {
    const tags = [
      day.today ? todayWord : undefined,
      day.actual !== undefined && day.actual > day.plan ? over : undefined,
    ].filter(Boolean);
    return [day.label, day.amountLabel, ...tags].join(' ');
  });
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={[title, ...parts].join('; ')}
      style={styles.card}
    >
      <Row justify="space-between" style={{ marginBottom: theme.space['12'] }}>
        <Text variant="eyebrow">{title}</Text>
        {legend ? <Text variant="eyebrow">{legend}</Text> : null}
      </Row>
      <Columns
        columns={days.map((day) => ({
          key: day.label,
          fraction: day.actual ?? 0,
          plan: day.plan,
          caption: day.label,
          color:
            day.actual !== undefined && day.actual > day.plan
              ? theme.semantic.state.urgent
              : theme.semantic.action.primary,
        }))}
      />
    </View>
  );
}
