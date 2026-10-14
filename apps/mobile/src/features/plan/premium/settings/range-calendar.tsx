/**
 * A month to pick a date range on (4.54, the new dates): weekday initials, the month's days in a
 * seven-column grid (cells 44 high, r12), the picked range in ink, and ‹ › to page months. A first
 * tap starts the range, a second ends it (a tap before the start starts again).
 */
/* eslint-disable lingui/no-unlocalized-strings -- ISO date parts, never copy. */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { format } from '@cp/i18n';

import { Icon, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

export interface DateRange {
  readonly start: string;
  readonly end: string;
}

const CELL = 44;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The days of a month (`YYYY-MM`) as ISO dates, led by blanks up to its first weekday (Mon first). */
export function monthCells(month: string): (string | null)[] {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(year, mon - 1, 1));
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, index) =>
      iso(new Date(Date.UTC(year, mon - 1, index + 1))),
    ),
  ];
}

export function shiftMonth(month: string, by: number): string {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  return iso(new Date(Date.UTC(year, mon - 1 + by, 1))).slice(0, 7);
}

/** The range after tapping `day`: a first tap (or one before the start) starts it again. */
export function nextRange(current: { start: string | null; end: string | null }, day: string) {
  if (current.start === null || current.end !== null || day < current.start) {
    return { start: day, end: null };
  }
  return { start: current.start, end: day };
}

export function RangeCalendar(props: {
  readonly locale: string;
  readonly month: string;
  readonly start: string | null;
  readonly end: string | null;
  /** The trip's dates now, drawn softly so the new range is picked against them. */
  readonly current?: { readonly start: string; readonly end: string } | null;
  readonly onMonth: (month: string) => void;
  readonly onDay: (day: string) => void;
}) {
  const theme = usePremiumTheme();
  const cells = monthCells(props.month);
  const title = format.date(props.locale, new Date(`${props.month}-15T12:00:00Z`), {
    month: 'long',
    year: 'numeric',
  });
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    format.date(props.locale, new Date(Date.UTC(2024, 0, 1 + index, 12)), { weekday: 'narrow' }),
  );
  const inRange = (day: string) =>
    props.start !== null &&
    (day === props.start || (props.end !== null && day >= props.start && day <= props.end));
  return (
    <View style={{ gap: theme.space.gap10 }} testID="range-calendar">
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="headline" style={{ flex: 1 }}>
          {title}
        </Text>
        <PressableScale
          onPress={() => props.onMonth(shiftMonth(props.month, -1))}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'plan.dates.prevMonth', message: 'Previous month' })}
          style={{ padding: theme.space.gap8 }}
        >
          <Icon name="back" size={18} color={theme.color.status.rain.text} />
        </PressableScale>
        <PressableScale
          onPress={() => props.onMonth(shiftMonth(props.month, 1))}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'plan.dates.nextMonth', message: 'Next month' })}
          style={{ padding: theme.space.gap8 }}
        >
          <Icon name="forward" size={18} color={theme.color.status.rain.text} />
        </PressableScale>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {weekdays.map((day, index) => (
          <Text key={index} variant="badge" tone="muted" align="center" style={{ flex: 1 }}>
            {day}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: theme.space.gap4 }}>
        {cells.map((day, index) => {
          if (day === null)
            return (
              <View key={`blank-${String(index)}`} style={{ width: `${100 / 7}%`, height: CELL }} />
            );
          const on = inRange(day);
          const now =
            props.current != null && day >= props.current.start && day <= props.current.end;
          return (
            <View key={day} style={{ width: `${100 / 7}%`, height: CELL, padding: 2 }}>
              <PressableScale
                onPress={() => props.onDay(day)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={format.date(props.locale, new Date(`${day}T12:00:00Z`), {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
                testID={`range-day-${day}`}
                style={{
                  flex: 1,
                  borderRadius: theme.radius.dayBadge,
                  backgroundColor: on ? theme.color.ink : now ? theme.color.control : undefined,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="rowTitle" tone={on ? 'onInk' : 'ink'}>
                  {String(Number(day.slice(8)))}
                </Text>
              </PressableScale>
            </View>
          );
        })}
      </View>
    </View>
  );
}
