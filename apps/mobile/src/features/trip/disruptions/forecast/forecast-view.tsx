/**
 * The forecast screen (3k-7) from props: THE REST OF THE TRIP with when it was last checked, the
 * guide's line, the day strip, and what could change the plan in impact order. A row with an open
 * storm decision opens it. A day opens its hours. Stale, offline, all clear and "no forecast yet"
 * each say so. The lab scenes render it with fixed data.
 */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS, type GuideStickerId } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';
import { WatchRow, type WatchTone } from '@/ui/trip/WatchRow';

import {
  checkedLabel,
  dayLabel,
  degrees,
  forecastLines,
  guideLine,
  hourLabel,
  percent,
  statusLabel,
  titleLines,
} from './copy';
import { DayStrip } from './day-strip';
import type { ForecastModel, WatchEntry } from './model';

export interface ForecastViewProps {
  readonly state: 'loading' | 'ready';
  readonly model: ForecastModel;
  readonly place: string;
  readonly tz: string;
  readonly guide: GuideStickerId;
  readonly offline: boolean;
  readonly themeFor: (date: string) => string | null;
  /** A watch row's title and detail in the reader's language. */
  readonly wordsFor: (entry: WatchEntry) => { readonly title: string; readonly detail: string };
  readonly onBack: () => void;
  readonly onOpenStorm: (pollId: string) => void;
}

const GUIDE_SIZE = 64;
const HOUR_STEP = 3;

const TONES: Readonly<Record<WatchEntry['status'], WatchTone>> = {
  plan_b: 'warning',
  watching: 'info',
  go: 'success',
  set: 'success',
};

const useStyles = makeStyles((th) => ({
  body: { padding: th.size.gutter, gap: th.space['16'] },
  title: { flex: 1 },
}));

export function ForecastView(props: ForecastViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const [openDay, setOpenDay] = useState<string | null>(null);
  const lines = forecastLines();
  const { model } = props;
  const [top, bottom] = titleLines(locale);
  const day = model.days.find((d) => d.date === openDay) ?? null;
  return (
    <Scaffold testID="forecast-screen">
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <Row justify="space-between" align="center">
          <BackEyebrow label={props.place} onPress={props.onBack} testID="forecast-back" />
          <Text variant="eyebrow" color={theme.semantic.text.tertiary} testID="forecast-checked">
            {checkedLabel(model.checkedAt, props.tz, model.stale, locale)}
          </Text>
        </Row>
        <Row gap="12" align="center">
          <Sticker
            kind={GUIDE_STICKERS[props.guide].kind}
            name={GUIDE_STICKERS[props.guide].name}
            size={GUIDE_SIZE}
          />
          <View style={styles.title} accessible accessibilityRole="header">
            <Text variant="displayXl">{top}</Text>
            <Text variant="displayXl">{bottom}</Text>
          </View>
        </Row>
        <Text variant="body" color={theme.semantic.text.secondary} singleLine={false}>
          {guideLine()}
        </Text>
        {props.offline ? <OfflinePill /> : null}
        {props.offline ? (
          <Text variant="caption" color={theme.semantic.text.secondary} testID="forecast-offline">
            {lines.offline}
          </Text>
        ) : model.stale ? (
          <Text variant="caption" color={theme.semantic.state.warning} testID="forecast-stale">
            {lines.stale}
          </Text>
        ) : null}
        {props.state === 'loading' ? (
          <Skeleton preset="card" repeat={2} testID="forecast-loading" />
        ) : (
          <>
            {model.days.length === 0 ? (
              <Card tone="raised" testID="forecast-no-days">
                <Text variant="body" color={theme.semantic.text.secondary} singleLine={false}>
                  {lines.noForecast}
                </Text>
              </Card>
            ) : (
              <DayStrip days={model.days} themeFor={props.themeFor} onOpenDay={setOpenDay} />
            )}
            <Text variant="eyebrow" color={theme.semantic.text.secondary}>
              {lines.section.toLocaleUpperCase(locale)}
            </Text>
            {model.allClear ? (
              <Card tone="raised" testID="forecast-all-clear">
                <Row gap="12" align="center">
                  <Icon name="sun" size={22} color={theme.semantic.state.success} decorative />
                  <Text variant="body" singleLine={false} style={styles.title}>
                    {lines.allClear}
                  </Text>
                </Row>
              </Card>
            ) : null}
            {model.watch.map((entry) => {
              const words = props.wordsFor(entry);
              const pollId = entry.status === 'plan_b' ? entry.pollId : null;
              return (
                <Card key={entry.row.id} tone="raised">
                  <WatchRow
                    icon={
                      <Icon
                        name={entry.icon}
                        size={20}
                        color={theme.semantic.text.onAccent}
                        decorative
                      />
                    }
                    title={words.title}
                    detail={words.detail}
                    status={statusLabel(entry.status, locale)}
                    tone={TONES[entry.status]}
                    {...(pollId === null ? {} : { onPress: () => props.onOpenStorm(pollId) })}
                    testID={`forecast-watch-${entry.row.id}`}
                  />
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>
      {day === null ? null : (
        <Sheet
          title={dayLabel(day.date, locale)}
          detents={['medium']}
          onDismiss={() => setOpenDay(null)}
          testID="forecast-hours"
        >
          <Stack gap="10">
            {day.hours.length === 0 ? (
              <Text variant="body" color={theme.semantic.text.secondary}>
                {lines.noHours}
              </Text>
            ) : (
              day.hours
                .filter((_, index) => index % HOUR_STEP === 0)
                .map((hour) => (
                  <Row key={hour.at} justify="space-between">
                    <Text variant="monoData">{hourLabel(hour.at, props.tz, locale)}</Text>
                    <Text variant="body">{degrees(hour.tempC, locale)}</Text>
                    <Text variant="body" color={theme.semantic.text.secondary}>
                      {`${lines.rain} ${percent(hour.rainPct, locale)}`}
                    </Text>
                  </Row>
                ))
            )}
          </Stack>
        </Sheet>
      )}
    </Scaffold>
  );
}
