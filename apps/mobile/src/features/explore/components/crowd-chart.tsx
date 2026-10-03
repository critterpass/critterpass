/**
 * CROWDS ON {date}: the place's busy-by-hour columns for the waking hours with the quiet window as
 * one instruction ("GO BEFORE 7:30"). A day the place is closed, or a place with no crowd data,
 * says so in the same card instead of drawing an empty chart.
 */
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { GrowBar } from '@/ui/data/LinearBar';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { noonUtc } from '../format';
import type { CrowdColumn, GoAdvice } from '../place-model';
import { clockOption } from '@/lib/i18n/formats';

export type CrowdChartProps = {
  /** `YYYY-MM-DD`, the place's local day. */
  readonly date: string;
} & (
  | {
      readonly kind: 'chart';
      readonly columns: readonly CrowdColumn[];
      readonly advice: GoAdvice | null;
      /** The hour the marker rings: now when the date is today, else the quiet window's start. */
      readonly markedHour: number | null;
      /** The quiet window's hours, drawn in the "good" colour. */
      readonly quietHours: readonly number[];
    }
  | { readonly kind: 'closed' }
  | { readonly kind: 'none' }
);

const CHART_HEIGHT = 64;
const MIN_BAR = 6;
const CAPTION_EVERY = 4;

/** The hours named under the bars: the first, every fourth after it, and the last. */
export function captionHours(hours: readonly number[]): number[] {
  const last = hours.at(-1);
  const picked = hours.filter((_, index) => index % CAPTION_EVERY === 0);
  return last === undefined || picked.includes(last) ? picked : [...picked, last];
}

const useStyles = makeStyles((t) => ({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: t.space['4'], height: CHART_HEIGHT },
  well: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderRadius: t.radius.xs, overflow: 'hidden' },
  marked: { borderWidth: t.space['2'], borderColor: t.semantic.action.primary },
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
    gap: t.space['8'],
  },
  badge: {
    backgroundColor: t.semantic.state.success,
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
  },
}));

/** "7:30" / "19:30" from local `HH:MM`, in the reader's clock style. */
export function clockText(locale: string, time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  return format.time(locale, new Date(2001, 0, 1, hour ?? 0, minute ?? 0), clockOption());
}

/** "6 AM" / "18" for an hour of the day, in the reader's clock style. */
function hourText(locale: string, hour: number): string {
  return format.date(locale, new Date(2001, 0, 1, hour), { hour: 'numeric', ...clockOption() });
}

export function CrowdChart(props: CrowdChartProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const day = format.date(locale, noonUtc(props.date), {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const title = upper(t({ id: 'explore.crowd.title', message: `Crowds on ${day}` }), locale);
  if (props.kind !== 'chart' || props.columns.length === 0) {
    return (
      <View
        style={styles.card}
        testID={`explore-crowd-${props.kind === 'closed' ? 'closed' : 'none'}`}
      >
        <Text variant="eyebrow">{title}</Text>
        <Text variant="bodySm">
          {props.kind === 'closed'
            ? t({
                id: 'explore.crowd.closed',
                message: `Closed on ${day}. Pick another day for this one.`,
              })
            : t({
                id: 'explore.crowd.none',
                message: 'No crowd data for this place yet. Early or late is the safe bet.',
              })}
        </Text>
      </View>
    );
  }
  const { advice } = props;
  const time = advice === null ? '' : clockText(locale, advice.time);
  const adviceLabel =
    advice === null
      ? null
      : advice.kind === 'before'
        ? t({ id: 'explore.crowd.before', message: `Go before ${time}` })
        : advice.kind === 'after'
          ? t({ id: 'explore.crowd.after', message: `Go after ${time}` })
          : t({ id: 'explore.crowd.around', message: `Go around ${time}` });
  const marked = props.markedHour;
  const quiet = (hour: number) =>
    advice !== null && props.quietHours.includes(hour) && hour !== marked;
  const captions = captionHours(props.columns.map((column) => column.hour));
  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="image"
      accessibilityLabel={adviceLabel === null ? title : `${title}, ${adviceLabel}`}
      testID="explore-crowd-chart"
    >
      <Row justify="space-between" align="center" gap="8">
        <View style={{ flexShrink: 1 }}>
          <Text variant="eyebrow">{title}</Text>
        </View>
        {adviceLabel === null ? null : (
          <View style={styles.badge} testID="explore-crowd-advice">
            <Text variant="label" color={theme.semantic.text.onAccent}>
              {upper(adviceLabel, locale)}
            </Text>
          </View>
        )}
      </Row>
      <View style={styles.bars}>
        {props.columns.map((column, index) => (
          <View key={column.hour} style={styles.well}>
            <View
              style={[
                styles.bar,
                { height: Math.max(MIN_BAR, Math.round(column.level * CHART_HEIGHT)) },
                column.hour === marked ? styles.marked : null,
              ]}
            >
              <GrowBar
                axis="y"
                fraction={1}
                index={index}
                color={
                  column.hour === marked || quiet(column.hour)
                    ? theme.semantic.state.success
                    : theme.semantic.bg.control
                }
              />
            </View>
          </View>
        ))}
      </View>
      {/* The hours sit in their own row, spread end to end, so a label is never cut to the width
          of one bar. */}
      <Row justify="space-between">
        {captions.map((hour) => (
          <Text key={hour} variant="caption" color={theme.semantic.text.secondary}>
            {hourText(locale, hour)}
          </Text>
        ))}
      </Row>
    </View>
  );
}
