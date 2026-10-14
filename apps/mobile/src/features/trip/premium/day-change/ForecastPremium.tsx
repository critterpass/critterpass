/**
 * The forecast (6.06): "Checked 07:30" in the header, "The rest of the trip" with the guide's line,
 * the days as a strip (the wet one inverted in ink), then what could change the plan, one row per
 * risk with its dot and status (Plan B in ink, Watching, Go, Set). A risk with an open storm
 * decision opens it. All clear says so, above the GO and SET rows it is made of; no days yet says
 * the forecast has not come in; an old check says it is the last one seen.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  OfflinePill,
  PressableScale,
  ScrollRow,
  Skeleton,
  StatusTag,
  type StatusTone,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import {
  checkedLabel,
  degrees,
  forecastLines,
  guideLine,
  percent,
} from '../../disruptions/forecast/copy';
import type { ForecastViewProps } from '../../disruptions/forecast/view-types';
import { standoutDay, type WatchEntry } from '../../disruptions/forecast/model';
import { useForecastScreen } from '../../disruptions/forecast/use-forecast-screen';
import { LineIcon } from '../components/LineIcon';

/** A day's tile in the strip at its narrowest (6.06: six days across the screen). */
const DAY_WIDTH = 56;

const TONE: Readonly<Record<WatchEntry['status'], StatusTone>> = {
  plan_b: 'unopened',
  watching: 'maybe',
  go: 'booked',
  set: 'unopened',
};

function useStatusWord() {
  const { t } = useLingui();
  return (status: WatchEntry['status']): string => {
    switch (status) {
      case 'plan_b':
        return t({ id: 'trip.disruptions.forecast.status.planB', message: 'Plan B' });
      case 'watching':
        return t({ id: 'trip.disruptions.forecast.status.watching', message: 'Watching' });
      case 'go':
        return t({ id: 'trip.disruptions.forecast.status.go', message: 'Go' });
      case 'set':
        return t({ id: 'trip.disruptions.forecast.status.set', message: 'Set' });
    }
  };
}

/** The forecast page once its rows are read (also what the screen tests render). */
export function ForecastReady({ props }: { readonly props: ForecastViewProps }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const statusWord = useStatusWord();
  const lines = forecastLines();
  const { model } = props;
  const { width } = useWindowDimensions();
  const standout = standoutDay(model.days);
  // The days share the row's width when they fit, so a short forecast fills the strip instead of
  // bunching at its start; a long one keeps the 56 pt day and scrolls.
  const span = width - th.space.gutter * 2;
  const dayWidth = Math.max(
    DAY_WIDTH,
    Math.floor((span - th.space.gap6 * (model.days.length - 1)) / Math.max(1, model.days.length)),
  );
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.body,
        { paddingHorizontal: th.space.gutter, gap: th.space.gap16 },
      ]}
    >
      {props.offline ? <OfflinePill /> : null}
      <View style={{ gap: th.space.gap4 }}>
        <Text variant="largeTitle" accessibilityRole="header">
          {t({ id: 'trip.disruptions.forecast.premiumTitle', message: 'The rest of the trip' })}
        </Text>
        <Text variant="rowText" tone="muted">
          {guideLine()}
        </Text>
      </View>
      {model.days.length === 0 ? (
        <Text variant="body" tone="inkSecondary" testID="forecast-no-days">
          {lines.noForecast}
        </Text>
      ) : (
        <ScrollRow
          // Bleeds through the page's gutter, so a scrolled day runs to the screen's edge.
          gap={th.space.gap6}
          bleed={th.space.gutter}
          testID="forecast-days"
        >
          {model.days.map((day) => {
            const risky = day.date === standout;
            const fg = risky ? th.color.onInk : th.color.ink;
            return (
              <View
                key={day.date}
                style={[
                  styles.day,
                  {
                    width: dayWidth,
                    borderRadius: th.radius.field,
                    backgroundColor: risky ? th.color.ink : th.color.card,
                    boxShadow: th.shadow.card,
                  },
                ]}
                testID={`forecast-day-${day.date}`}
              >
                <Text variant="tier" color={fg}>
                  {format.date(
                    locale,
                    // eslint-disable-next-line lingui/no-unlocalized-strings -- a date at noon UTC, not copy
                    new Date(`${day.date}T12:00:00Z`),
                    {
                      weekday: 'short',
                      timeZone: 'UTC',
                    },
                  )}
                </Text>
                <LineIcon name={day.wet ? 'rain' : 'sun'} size={24} color={fg} />
                <Text variant="headline" color={fg}>
                  {day.highC === null ? '–' : degrees(day.highC, locale)}
                </Text>
                <Text variant="badge" color={fg} style={styles.soft}>
                  {percent(day.rainPct, locale)}
                </Text>
              </View>
            );
          })}
        </ScrollRow>
      )}
      <Text variant="label" tone="muted">
        {lines.section}
      </Text>
      {model.stale ? (
        <Text variant="caption" color={th.color.status.tangerine.text}>
          {lines.stale}
        </Text>
      ) : null}
      {model.allClear ? (
        <Text variant="body" tone="inkSecondary" testID="forecast-all-clear">
          {lines.allClear}
        </Text>
      ) : null}
      {model.watch.length === 0 ? null : (
        <View
          style={[
            styles.card,
            {
              borderRadius: th.radius.cardRow,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.card,
            },
          ]}
        >
          {model.watch.map((entry, index) => {
            const words = props.wordsFor(entry);
            const dot =
              entry.status === 'plan_b'
                ? th.accent.pink
                : entry.status === 'watching'
                  ? th.accent.sun
                  : th.accent.mint;
            const row = (
              <View
                style={[
                  styles.risk,
                  index === 0 ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
                ]}
              >
                <View style={[styles.dot, { backgroundColor: dot }]} />
                <View style={styles.flex}>
                  <Text variant="rowTitle">{words.title}</Text>
                  {words.detail === '' ? null : (
                    <Text variant="captionMuted" tone="muted">
                      {words.detail}
                    </Text>
                  )}
                </View>
                {entry.status === 'plan_b' ? (
                  <View style={[styles.planB, { backgroundColor: th.color.ink }]}>
                    <Text variant="badge" color={th.color.onInk}>
                      {statusWord(entry.status)}
                    </Text>
                  </View>
                ) : (
                  <StatusTag label={statusWord(entry.status)} tone={TONE[entry.status]} />
                )}
              </View>
            );
            const pollId = entry.pollId;
            return pollId === null ? (
              <View key={entry.row.id} testID={`forecast-watch-${entry.row.id}`}>
                {row}
              </View>
            ) : (
              <PressableScale
                key={entry.row.id}
                onPress={() => props.onOpenStorm(pollId)}
                accessibilityRole="button"
                testID={`forecast-watch-${entry.row.id}`}
              >
                {row}
              </PressableScale>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

export function ForecastPremium({ tripId }: { readonly tripId: string }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const forecast = useForecastScreen(tripId);
  const { props } = forecast;
  return (
    <PushScreen
      title={t({ id: 'trip.disruptions.forecast.premiumNav', message: 'Forecast' })}
      subtitle={checkedLabel(props.model.checkedAt, props.tz, props.model.stale, locale)}
      backLabel={forecast.back}
      scroll={false}
      testID="forecast-screen"
    >
      {forecast.missing ? (
        <Text variant="body" tone="muted" align="center" testID="forecast-missing">
          {t({
            id: 'trip.disruptions.forecast.premiumMissing',
            message: 'This trip is not on this phone.',
          })}
        </Text>
      ) : props.state === 'loading' ? (
        <View style={{ padding: th.space.gutter, gap: th.space.gap12 }}>
          <Skeleton height={110} radius={th.radius.field} />
          <Skeleton height={180} radius={th.radius.cardRow} />
        </View>
      ) : (
        <ForecastReady props={props} />
      )}
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 40 },
  day: { alignItems: 'center', gap: 4, paddingVertical: 10 },
  soft: { opacity: 0.75 },
  card: { paddingHorizontal: 14, paddingVertical: 2 },
  risk: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  flex: { flex: 1, minWidth: 0 },
  planB: { height: 28, borderRadius: 14, paddingHorizontal: 11, justifyContent: 'center' },
});
