/**
 * CROWDS ON {date}: the place's busy-by-hour columns for the waking hours with the quiet window as
 * one instruction ("GO BEFORE 7:30"). A day the place is closed, or a place with no crowd data,
 * says so in the same card instead of drawing an empty chart.
 */
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { HourlyCrowd } from '@/ui/data/HourlyCrowd';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { noonUtc } from '../format';
import type { CrowdColumn, GoAdvice } from '../place-model';

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
    }
  | { readonly kind: 'closed' }
  | { readonly kind: 'none' }
);

const useStyles = makeStyles((t) => ({
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
  return format.time(locale, new Date(2001, 0, 1, hour ?? 0, minute ?? 0));
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
  return (
    <HourlyCrowd
      title={title}
      hours={props.columns}
      captionEvery={4}
      {...(props.markedHour === null ? {} : { nowHour: props.markedHour })}
      {...(adviceLabel === null
        ? {}
        : {
            badgeLabel: adviceLabel,
            badge: (
              <View style={styles.badge} testID="explore-crowd-advice">
                <Text variant="label" color={theme.semantic.text.onAccent}>
                  {upper(adviceLabel, locale)}
                </Text>
              </View>
            ),
          })}
      testID="explore-crowd-chart"
    />
  );
}
