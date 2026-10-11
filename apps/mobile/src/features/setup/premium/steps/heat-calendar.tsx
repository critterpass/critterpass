/**
 * The crew's free days as a heat calendar (4.10): one month at a time with ‹ ›, each day tinted by
 * how many are free (the whole crew in full mint, fewer paler), "4/6" under the day number, the
 * suggested or locked week in ink, and the week's pill over the grid ("Apr 2–9 · all 6 free").
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { Card, Icon, PressableScale, StatusTag, Text, usePremiumTheme } from '@/ui/premium';

import { monthLabel } from '../../when/copy';
import type { HeatMonth } from '../../when/model';

const CELL = 44;
/* eslint-disable lingui/no-unlocalized-strings -- keys and a reference date, never copy. */
const WEEK_START = '2024-01-01T12:00:00Z';
const blankKey = (at: number) => `blank-${String(at)}`;
/* eslint-enable lingui/no-unlocalized-strings */

/** How far toward full mint a day sits: free out of everyone, never below a trace. */
export function heatShare(free: number, total: number): number {
  if (total <= 0 || free <= 0) return 0;
  return Math.min(1, free / total);
}

export function HeatCalendar(props: {
  readonly months: readonly HeatMonth[];
  readonly startIndex: number;
  readonly total: number;
  readonly window: { readonly start: string; readonly end: string } | null;
  readonly windowLabel?: string | undefined;
}) {
  const theme = usePremiumTheme();
  const { i18n } = useLingui();
  const [index, setIndex] = useState(props.startIndex);
  const month = props.months[Math.max(0, Math.min(index, props.months.length - 1))];
  if (month === undefined) return null;
  const weekdays = Array.from({ length: 7 }, (_, offset) =>
    new Date(Date.parse(WEEK_START) + offset * 86_400_000).toLocaleDateString(i18n.locale, {
      weekday: 'narrow',
    }),
  );
  const inWindow = (date: string) =>
    props.window !== null && date >= props.window.start && date <= props.window.end;
  const cells = [...Array.from({ length: month.leadingBlanks }, () => null), ...month.days];
  return (
    <Card padded testID="when-heatmap">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap8 }}>
        <Text variant="headline" style={{ flex: 1 }}>
          {monthLabel(i18n.locale, month.year, month.month)}
        </Text>
        {props.windowLabel === undefined ? null : (
          <StatusTag tone="booked" label={props.windowLabel} />
        )}
        <PressableScale
          onPress={() => setIndex((at) => Math.max(0, at - 1))}
          disabled={index <= 0}
          accessibilityRole="button"
          accessibilityLabel={monthLabel(i18n.locale, month.year, month.month - 1 || 12)}
          style={{ padding: theme.space.gap4, opacity: index <= 0 ? 0.3 : 1 }}
        >
          <Icon name="back" size={16} color={theme.color.status.rain.text} />
        </PressableScale>
        <PressableScale
          onPress={() => setIndex((at) => Math.min(props.months.length - 1, at + 1))}
          disabled={index >= props.months.length - 1}
          accessibilityRole="button"
          accessibilityLabel={monthLabel(i18n.locale, month.year, (month.month % 12) + 1)}
          style={{ padding: theme.space.gap4, opacity: index >= props.months.length - 1 ? 0.3 : 1 }}
        >
          <Icon name="forward" size={16} color={theme.color.status.rain.text} />
        </PressableScale>
      </View>
      <View style={{ flexDirection: 'row', marginTop: theme.space.gap10 }}>
        {weekdays.map((day, at) => (
          <Text key={at} variant="badge" tone="muted" align="center" style={{ flex: 1 }}>
            {day}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: theme.space.gap4 }}>
        {cells.map((day, at) => {
          if (day === null)
            return <View key={blankKey(at)} style={{ width: `${100 / 7}%`, height: CELL }} />;
          const picked = inWindow(day.date);
          const share = heatShare(day.free, props.total);
          return (
            <View key={day.date} style={{ width: `${100 / 7}%`, height: CELL, padding: 2 }}>
              <View
                accessible
                accessibilityLabel={`${String(day.day)}: ${String(day.free)}/${String(props.total)}`}
                style={{
                  flex: 1,
                  borderRadius: theme.radius.dayBadge,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  backgroundColor: picked ? theme.color.ink : theme.color.ground,
                }}
              >
                {picked || share === 0 ? null : (
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: theme.accent.mint,
                      opacity: 0.25 + 0.75 * share,
                    }}
                  />
                )}
                <Text variant="rowTitle" tone={picked ? 'onInk' : 'ink'}>
                  {String(day.day)}
                </Text>
                {props.total > 1 && day.free > 0 ? (
                  <Text
                    variant="badge"
                    tone={picked ? 'onInk' : 'inkSecondary'}
                    style={{ opacity: 0.75 }}
                  >
                    {`${String(day.free)}/${String(props.total)}`}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
