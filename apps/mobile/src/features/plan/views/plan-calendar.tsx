/**
 * The plan's CALENDAR tab (undesigned; built from day tiles and tokens): each month the trip
 * spans, Monday first, with trip dates filled in the day's colour, the day number and one bar per
 * item (up to three). Tapping a trip date opens that day. The export actions sit under the grid.
 */
import { plural, t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dayTileColour } from '../overview/day-card';
import type { CalendarMonth } from './model/views-model';

const CELL = 44;
const MAX_BARS = 3;

const useStyles = makeStyles((th) => ({
  wrap: { gap: th.space['20'] },
  month: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
    gap: th.space['6'],
  },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: {
    width: CELL,
    height: CELL + 6,
    borderRadius: th.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: th.space['2'],
  },
  today: { borderWidth: 2, borderColor: th.semantic.action.primary },
  bars: { flexDirection: 'row', gap: th.space['2'], height: 4 },
  bar: { width: 8, height: 4, borderRadius: 2 },
  head: { width: CELL, alignItems: 'center' },
  notice: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
  },
}));

/** Monday-first short weekday names in the reader's language. */
function weekdayHeads(locale: string): string[] {
  // 2026-11-02 is a Monday.
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 10, 2 + i, 12)),
    ),
  );
}

export interface PlanCalendarProps {
  readonly months: readonly CalendarMonth[];
  readonly onOpenDay: (dayNo: number) => void;
  /** The export actions (add to my calendar, subscribe). */
  readonly actions?: ReactNode;
}

export function PlanCalendar({ months, onOpenDay, actions }: PlanCalendarProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const heads = weekdayHeads(locale);
  if (months.length === 0) {
    return (
      <View style={styles.wrap} testID="plan-calendar">
        <View style={styles.notice} testID="plan-calendar-no-dates">
          <Text variant="body">
            {t({
              id: 'plan.calendar.noDates',
              message: 'The dates aren’t set yet, so there’s no calendar to show.',
            })}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.wrap} testID="plan-calendar">
      {months.map((month) => {
        const [year, m] = month.month.split('-').map(Number);
        const title = new Intl.DateTimeFormat(locale, {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(Date.UTC(year ?? 0, (m ?? 1) - 1, 1, 12)));
        return (
          <View key={month.month} style={styles.month}>
            <Text variant="h3" accessibilityRole="header">
              {upper(title, locale)}
            </Text>
            <View style={styles.week}>
              {heads.map((head, i) => (
                <View key={i} style={styles.head}>
                  <Text variant="label" color={theme.semantic.text.secondary}>
                    {head}
                  </Text>
                </View>
              ))}
            </View>
            {month.weeks.map((week) => (
              <View key={week[0]?.date} style={styles.week}>
                {week.map((cell) => {
                  const dayNo = cell.dayNo;
                  const date = Number(cell.date.slice(8));
                  const onTrip = dayNo !== null && cell.inMonth;
                  const face = (
                    <View
                      style={[
                        styles.cell,
                        onTrip ? { backgroundColor: dayTileColour(dayNo) } : null,
                        cell.today ? styles.today : null,
                      ]}
                    >
                      <Text
                        variant={onTrip ? 'title' : 'bodySm'}
                        color={
                          onTrip
                            ? theme.semantic.text.onAccent
                            : cell.inMonth
                              ? theme.semantic.text.primary
                              : theme.semantic.text.tertiary
                        }
                      >
                        {String(date)}
                      </Text>
                      {onTrip ? (
                        <View style={styles.bars}>
                          {Array.from({ length: Math.min(cell.items, MAX_BARS) }, (_, i) => (
                            <View
                              key={i}
                              style={[
                                styles.bar,
                                { backgroundColor: theme.semantic.text.onAccent },
                              ]}
                            />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                  return onTrip ? (
                    <Pressable
                      key={cell.date}
                      accessibilityRole="button"
                      accessibilityLabel={[
                        t({ id: 'plan.calendar.day', message: `Day ${dayNo}` }),
                        t({
                          id: 'plan.calendar.items',
                          message: plural(cell.items, { one: '# plan', other: '# plans' }),
                        }),
                      ].join(', ')}
                      onPress={() => onOpenDay(dayNo)}
                      testID={`plan-calendar-day-${dayNo}`}
                    >
                      {face}
                    </Pressable>
                  ) : (
                    <View key={cell.date} importantForAccessibility="no-hide-descendants">
                      {face}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        );
      })}
      {actions}
    </View>
  );
}
