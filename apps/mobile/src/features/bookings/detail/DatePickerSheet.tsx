/**
 * The booking form's day (undesigned; the setup flow's month grid in a sheet): one month at a time
 * with ‹ › to move, Monday-first narrow weekday names, the trip's days tinted, the picked day
 * filled; tapping a day picks it and closes the sheet. The field shows the day in the reader's
 * language ("Fri 2 Oct 2026") and opens the sheet on the picked day's month, else the trip's.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { IconButton } from '@/ui/buttons/IconButton';
import { Row } from '@/ui/layout/Row';
import { PressScale } from '@/ui/press/PressScale';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { Stack } from '@/ui/layout/Stack';
import { makeStyles, sizeToken, useTheme } from '@/ui/theme';

import { monthOf, monthWeeks, shiftMonth } from './date-grid';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['12'] },
  // Seven equal flex cells a row: percentage widths wrap the seventh day on iOS.
  week: { flexDirection: 'row' },
  cell: { flex: 1, padding: th.space['2'] },
  box: {
    borderRadius: th.radius.sm,
    minHeight: th.space['32'] + th.space['12'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The same box as a text field, so the day reads as one of the form's fields.
  field: {
    minHeight: sizeToken(th.size.otpBox, 'height'),
    borderRadius: th.radius.md,
    borderWidth: th.ring.input.idle.widthPt,
    backgroundColor: th.semantic.bg.raised,
    paddingHorizontal: th.space['14'],
    justifyContent: 'center',
  },
}));

/** Midday UTC of a `YYYY-MM-DD` day, so it reads as that day in any zone. */
const noon = (date: string) => new Date(Date.parse(date) + 12 * 3_600_000);

export interface DatePickerSheetProps {
  readonly value: string;
  /** The trip's first and last day, tinted on the grid. */
  readonly trip: { readonly start: string; readonly end: string } | null;
  readonly title: string;
  readonly onPick: (date: string) => void;
  readonly onDismiss: () => void;
}

export function DatePickerSheet(props: DatePickerSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const [month, setMonth] = useState(() => monthOf(props.value, props.trip?.start ?? null));
  const title = format.date(locale, noon(`${month}-15`), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  // 2024-01-01 was a Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    format.date(locale, new Date(Date.UTC(2024, 0, 1 + i)), { weekday: 'narrow', timeZone: 'UTC' }),
  );
  return (
    <Sheet
      detents={['fit']}
      title={props.title}
      onDismiss={props.onDismiss}
      accessibilityLabel={props.title}
      testID="bookings-date-sheet"
    >
      <View style={styles.body}>
        <Row justify="space-between" align="center">
          <IconButton
            label={t({ id: 'bookings.date.previous', message: 'Previous month' })}
            glyph={<Text variant="title">‹</Text>}
            size={40}
            onPress={() => setMonth(shiftMonth(month, -1))}
            testID="bookings-date-previous"
          />
          <Text variant="title" accessibilityRole="header" testID="bookings-date-month">
            {title}
          </Text>
          <IconButton
            label={t({ id: 'bookings.date.next', message: 'Next month' })}
            glyph={<Text variant="title">›</Text>}
            size={40}
            onPress={() => setMonth(shiftMonth(month, 1))}
            testID="bookings-date-next"
          />
        </Row>
        <View style={styles.week} importantForAccessibility="no-hide-descendants">
          {weekdays.map((weekday, index) => (
            <View key={`w${index}`} style={styles.cell}>
              <Text
                variant="label"
                color={theme.semantic.text.secondary}
                style={{ textAlign: 'center' }}
              >
                {weekday}
              </Text>
            </View>
          ))}
        </View>
        <View>
          {monthWeeks(month).map((week, row) => (
            <View key={`r${row}`} style={styles.week}>
              {week.map((date, column) => {
                if (date === null) return <View key={row * 7 + column} style={styles.cell} />;
                const picked = date === props.value;
                const onTrip =
                  props.trip !== null && date >= props.trip.start && date <= props.trip.end;
                const background = picked
                  ? theme.semantic.action.primary
                  : onTrip
                    ? theme.semantic.bg.control
                    : 'transparent';
                return (
                  <View key={date} style={styles.cell}>
                    <PressScale
                      widthClass="narrow"
                      accessibilityLabel={format.date(locale, noon(date), {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        timeZone: 'UTC',
                      })}
                      accessibilityState={{ selected: picked }}
                      onPress={() => props.onPick(date)}
                      testID={`bookings-date-${date}`}
                    >
                      <View style={[styles.box, { backgroundColor: background }]}>
                        <Text
                          variant="label"
                          color={
                            picked ? theme.semantic.text.onAccent : theme.semantic.text.primary
                          }
                        >
                          {String(Number(date.slice(8)))}
                        </Text>
                      </View>
                    </PressScale>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </Sheet>
  );
}

export interface DateFieldProps {
  readonly label: string;
  readonly value: string;
  readonly trip: DatePickerSheetProps['trip'];
  readonly problem?: string | undefined;
  readonly onChange: (date: string) => void;
  readonly testID: string;
}

/** A form field that shows the picked day and opens the month grid. */
export function DateField(props: DateFieldProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const shown =
    props.value === ''
      ? t({ id: 'bookings.date.pick', message: 'Pick a day' })
      : format.date(locale, noon(props.value), {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        });
  const ring =
    props.problem === undefined ? theme.semantic.border.control : theme.semantic.state.urgent;
  return (
    <>
      <Stack gap="6">
        <Text variant="eyebrow" accessibilityElementsHidden importantForAccessibility="no">
          {props.label}
        </Text>
        <PressScale
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${props.label}, ${shown}`}
          accessibilityHint={props.problem}
          testID={props.testID}
        >
          <View style={[styles.field, { borderColor: ring }]}>
            <Text
              variant="body"
              color={props.value === '' ? theme.color.ink[300] : theme.semantic.text.primary}
              numberOfLines={1}
            >
              {shown}
            </Text>
          </View>
        </PressScale>
        {props.problem === undefined ? null : (
          <Text variant="bodySm" color={theme.semantic.state.urgent}>
            {props.problem}
          </Text>
        )}
      </Stack>
      {open ? (
        <DatePickerSheet
          value={props.value}
          trip={props.trip}
          title={props.label}
          onPick={(date) => {
            props.onChange(date);
            setOpen(false);
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
