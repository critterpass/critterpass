/**
 * "Pick a week anyway" (undesigned): the organiser taps a first day on the same heatmap, sets how
 * many days with − / +, and locks it. The chosen days are outlined; how many can make every day
 * of it is shown before locking, so nobody is dropped by surprise.
 */
import { t } from '@lingui/core/macro';
import { useMemo, useState } from 'react';

import { TRIP_LENGTH_MAX_DAYS, TRIP_LENGTH_MIN_DAYS } from '@cp/domain';

import { useLocale } from '@/lib/i18n/use-locale';
import { IconButton } from '@/ui/buttons/IconButton';
import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { countWord, rangeLabel, sentenceStart } from './copy';
import { Heatmap } from './heatmap';
import { dateValue, type HeatMonth } from './model';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['12'] },
  stepper: { gap: th.space['12'] },
}));

function addDays(date: string, days: number): string {
  return new Date(dateValue(date).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** The fewest free on any day of the window (who can make all of it). */
function freeAllWeek(months: readonly HeatMonth[], start: string, end: string): number {
  const days = months
    .flatMap((month) => month.days)
    .filter((d) => d.date >= start && d.date <= end);
  return days.length === 0 ? 0 : Math.min(...days.map((day) => day.free));
}

export interface WeekPickerProps {
  readonly months: readonly HeatMonth[];
  readonly startMonth: number;
  readonly total: number;
  readonly lengthDays: number;
  readonly busy: boolean;
  readonly onLock: (start: string, end: string) => void;
  readonly onDismiss: () => void;
}

export function WeekPicker({
  months,
  startMonth,
  total,
  lengthDays,
  busy,
  onLock,
  onDismiss,
}: WeekPickerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const [start, setStart] = useState<string | null>(null);
  const [length, setLength] = useState(lengthDays);
  const end = start === null ? null : addDays(start, length - 1);
  const window = useMemo(
    () => (start === null || end === null ? null : { start, end }),
    [start, end],
  );
  const title = t({ id: 'setup.when.picker.title', message: 'Pick a week' });
  const free = window === null ? 0 : freeAllWeek(months, window.start, window.end);
  const who = sentenceStart(countWord(free));
  const range = window === null ? '' : rangeLabel(locale, window.start, window.end);
  const all = countWord(total);
  return (
    <Sheet onDismiss={onDismiss} accessibilityLabel={title} testID="week-picker">
      <SheetScrollView>
        <Stack style={styles.body}>
          <Text variant="h2" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {t({ id: 'setup.when.picker.line', message: 'Tap the first day. Set how long below.' })}
          </Text>
          <Row align="center" style={styles.stepper}>
            <IconButton
              label={t({ id: 'setup.when.picker.shorter', message: 'One day shorter' })}
              glyph={<Text variant="title">−</Text>}
              disabled={length <= TRIP_LENGTH_MIN_DAYS}
              onPress={() => setLength((n) => Math.max(TRIP_LENGTH_MIN_DAYS, n - 1))}
              testID="picker-shorter"
            />
            <Text variant="title" accessibilityLiveRegion="polite">
              {t({ id: 'setup.when.picker.days', message: `${length} days` })}
            </Text>
            <IconButton
              label={t({ id: 'setup.when.picker.longer', message: 'One day longer' })}
              glyph={<Text variant="title">+</Text>}
              disabled={length >= TRIP_LENGTH_MAX_DAYS}
              onPress={() => setLength((n) => Math.min(TRIP_LENGTH_MAX_DAYS, n + 1))}
              testID="picker-longer"
            />
          </Row>
          <Heatmap
            months={months}
            startIndex={startMonth}
            total={total}
            window={window}
            onSelectDay={setStart}
          />
          {window === null ? null : (
            <Text variant="bodySm" color={theme.semantic.text.secondary} testID="picker-free">
              {t({
                id: 'setup.when.picker.free',
                message: `${who} of ${all} can make every day of it.`,
              })}
            </Text>
          )}
          {window === null ? null : (
            <PillButton
              label={t({ id: 'setup.when.cta.lock', message: `Lock ${range}` })}
              loading={busy}
              onPress={() => onLock(window.start, window.end)}
              testID="picker-lock"
            />
          )}
        </Stack>
      </SheetScrollView>
    </Sheet>
  );
}
