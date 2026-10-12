/**
 * Mark your days (4.12), a tall sheet: pick a brush (Free, Busy, Maybe, each with its swatch),
 * then tap or hold and drag across the month to paint; painting a day already in that state clears
 * it. Painted days in the same week join into runs (rounded only at the run's ends): Free in mint,
 * Busy in ink, Maybe on butter with a dashed edge, each with its word for screen readers. "Save my
 * days" queues the marks; the shared `ManualDaysSheet` loads and saves them.
 */
/* eslint-disable lingui/no-unlocalized-strings -- ISO date parts, never copy. */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { OverlaySheet } from '@/features/plan';
import { useLocale } from '@/lib/i18n/use-locale';
import { Button, SegmentedControl, Text, usePremiumTheme } from '@/ui/premium';

import { markWord } from '../../calendar/manual-day-face';
import { monthCount, monthGrid, type ManualMark } from '../../calendar/manual-days';
import type { ManualDaysViewProps } from '../../calendar/manual-days-sheet';
import { useManualPaint } from '../../calendar/use-manual-paint';
import { monthLabel } from '../../when/copy';
import { weeksOfDates } from '../../when/day-grid';
import { MonthGrid } from './month-grid';

const BRUSHES: readonly ManualMark[] = ['free', 'busy', 'maybe'];
const RUN_END = 14;
const DAY_MS = 86_400_000;

/** The day before or after `date` (`YYYY-MM-DD`). */
function nextTo(date: string, by: 1 | -1): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10);
}

/** Monday-first column of `date`, 0 to 6. */
function columnOf(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function PremiumManualDaysView(props: ManualDaysViewProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const [tool, setTool] = useState<ManualMark>(props.initialTool ?? 'free');
  const pages = monthCount(props.from, props.to);
  const grid = monthGrid(props.from, props.page);
  const open = (date: string) => date >= props.from && date <= props.to;
  const { paint, onDrag } = useManualPaint(props.marks, tool, open, props.onMarks);
  const step = (by: 1 | -1) => props.onPage(Math.max(0, Math.min(pages - 1, props.page + by)));
  const look: Record<ManualMark, { bg: string; ink: string; dashed: boolean }> = {
    free: { bg: theme.accent.mint, ink: theme.color.onAccent, dashed: false },
    busy: { bg: theme.color.ink, ink: theme.color.onInk, dashed: false },
    maybe: { bg: theme.color.status.maybe.bg, ink: theme.color.status.maybe.text, dashed: true },
  };
  const renderDay = (date: string) => {
    const mark = props.marks[date];
    const column = columnOf(date);
    const joinsBefore = mark !== undefined && column > 0 && props.marks[nextTo(date, -1)] === mark;
    const joinsAfter = mark !== undefined && column < 6 && props.marks[nextTo(date, 1)] === mark;
    const face = mark === undefined ? null : look[mark];
    const dayName = format.date(locale, new Date(Date.parse(`${date}T12:00:00Z`)), {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
    const state = markWord(mark);
    return (
      <Pressable
        onPress={() => paint(date)}
        disabled={!open(date)}
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'setup.manual.dayA11y', message: `${dayName}, ${state}` })}
        testID={`manual-day-${date}`}
        style={{
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: open(date) ? 1 : 0.35,
          marginLeft: joinsBefore ? -2 : 0,
          marginRight: joinsAfter ? -2 : 0,
          borderTopLeftRadius: joinsBefore ? 0 : RUN_END,
          borderBottomLeftRadius: joinsBefore ? 0 : RUN_END,
          borderTopRightRadius: joinsAfter ? 0 : RUN_END,
          borderBottomRightRadius: joinsAfter ? 0 : RUN_END,
          backgroundColor: face?.bg ?? 'transparent',
          ...(face?.dashed === true
            ? {
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: theme.color.status.maybe.text,
                borderLeftWidth: joinsBefore ? 0 : 1.5,
                borderRightWidth: joinsAfter ? 0 : 1.5,
              }
            : {}),
        }}
      >
        <Text variant="rowTitle" color={face?.ink ?? theme.color.ink}>
          {String(Number(date.slice(8)))}
        </Text>
      </Pressable>
    );
  };
  return (
    <OverlaySheet
      tall
      scroll={false}
      title={t({ id: 'setup.manual.title', message: 'Mark your days' })}
      line={t({
        id: 'setup.premium.manual.line',
        message: 'Pick a brush, then drag across the days.',
      })}
      closeLabel={t({ id: 'setup.premium.calendar.close', message: 'Close' })}
      onDismiss={props.onDismiss}
      footer={
        <Button
          label={t({ id: 'setup.manual.save', message: 'Save my days' })}
          onPress={props.onSave}
          loading={props.saving}
          testID="manual-days-save"
        />
      }
      testID="manual-days"
    >
      <SegmentedControl
        options={BRUSHES.map((mark) => ({ value: mark, label: markWord(mark) }))}
        value={tool}
        onChange={setTool}
        accessibilityLabel={t({ id: 'setup.premium.manual.brush', message: 'Brush' })}
        testID="manual-tool"
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.space.gap16 }}>
        {BRUSHES.map((mark) => (
          <View
            key={mark}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap6 }}
          >
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 4,
                backgroundColor: look[mark].bg,
                ...(look[mark].dashed
                  ? {
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: theme.color.status.maybe.text,
                    }
                  : {}),
              }}
            />
            <Text variant="captionMuted" tone="muted">
              {markWord(mark)}
            </Text>
          </View>
        ))}
      </View>
      <MonthGrid
        title={monthLabel(locale, grid.year, grid.month)}
        weeks={weeksOfDates(grid.leadingBlanks, grid.days)}
        page={props.page}
        pages={pages}
        onStep={step}
        renderDay={renderDay}
        onDrag={onDrag}
        testID="manual-days-grid"
      />
    </OverlaySheet>
  );
}
