/**
 * Picking the trip's days by hand (undesigned; "Pick another week" / "Pick a week anyway"): up to
 * three best windows as chips, the same heatmap to tap a first and last day on (or hold and drag),
 * a ghost of the planned length after the first tap that one more tap takes, and the length, who
 * can make every day of it and Lock, live under the calendar. Only counts, never anyone's days.
 */
import { t } from '@lingui/core/macro';
import { useMemo, useRef, useState } from 'react';

import { TRIP_LENGTH_MAX_DAYS } from '@cp/domain';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { countWord, lengthAndRange, rangeLabel, sentenceStart, windowChipLabel } from './copy';
import type { DragHandlers } from './day-grid';
import { Heatmap } from './heatmap';
import type { HeatMonth } from './model';
import {
  bestWindows,
  dragGrip,
  dragTo,
  EMPTY_PICK,
  freeAllDays,
  freeByDate,
  ghostRange,
  rangeLength,
  rangeProblem,
  shownRange,
  tapDay,
  type DayRange,
  type DragGrip,
  type RangePick,
} from './range';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['12'] },
  chips: { flexWrap: 'wrap', gap: th.space['8'] },
  summary: { gap: th.space['4'] },
}));

export interface WeekPickerProps {
  readonly months: readonly HeatMonth[];
  readonly startMonth: number;
  readonly total: number;
  /** The trip's planned length: the ghost's and the chips' length. */
  readonly lengthDays: number;
  /** Today (`YYYY-MM-DD`): nothing earlier can be picked. */
  readonly today?: string | undefined;
  readonly busy: boolean;
  readonly onLock: (start: string, end: string) => void;
  readonly onDismiss: () => void;
  /** Opens on this pick (the lab's scenes). */
  readonly initialPick?: RangePick | undefined;
}

interface Drag {
  readonly origin: string;
  readonly grip: DragGrip;
  readonly base: RangePick;
}

const sameRange = (a: DayRange | null, b: DayRange) => a?.start === b.start && a.end === b.end;

export function WeekPicker({
  months,
  startMonth,
  total,
  lengthDays,
  today,
  busy,
  onLock,
  onDismiss,
  initialPick,
}: WeekPickerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const free = useMemo(() => freeByDate(months), [months]);
  const firstDate = months[0]?.days[0]?.date ?? '';
  const lastDate = months.at(-1)?.days.at(-1)?.date ?? null;
  const chips = useMemo(
    () => bestWindows(free, lengthDays, today ?? firstDate),
    [free, lengthDays, today, firstDate],
  );
  const [pick, setPick] = useState<RangePick>(initialPick ?? EMPTY_PICK);
  // A chip turns the calendar to its month; the key remounts the grid on that page.
  const [focus, setFocus] = useState({ month: startMonth, key: 0 });
  const drag = useRef<Drag | null>(null);
  const ghost = pick.anchor === null ? null : ghostRange(free, pick.anchor, lengthDays, lastDate);
  const shown = shownRange(pick, ghost);
  const picked = pick.range;
  const problem = picked === null ? null : rangeProblem(picked);
  const open = (date: string) => today === undefined || date >= today;
  const clampOpen = (date: string) => (today !== undefined && date < today ? today : date);

  const onDrag: DragHandlers = {
    begin: (date) => {
      if (!open(date)) return;
      const grip = dragGrip(pick, date);
      drag.current = { origin: date, grip, base: pick };
      setPick(dragTo(pick, date, grip, date));
    },
    move: (date) => {
      const held = drag.current;
      if (held !== null) setPick(dragTo(held.base, held.origin, held.grip, clampOpen(date)));
    },
    end: () => {
      drag.current = null;
    },
  };
  const choose = (window: DayRange) => {
    setPick({ anchor: null, range: window });
    const month = months.findIndex((m) => m.key === window.start.slice(0, 7));
    if (month >= 0) setFocus((current) => ({ month, key: current.key + 1 }));
  };

  const title = t({ id: 'setup.when.picker.titleDays', message: 'Pick your days' });
  const who = sentenceStart(countWord(picked === null ? 0 : freeAllDays(free, picked)));
  const all = countWord(total);
  const max = TRIP_LENGTH_MAX_DAYS;
  const range = picked === null ? '' : rangeLabel(locale, picked.start, picked.end);
  return (
    <Sheet onDismiss={onDismiss} accessibilityLabel={title} testID="week-picker">
      <SheetScrollView>
        <Stack style={styles.body}>
          <Text variant="h2" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {t({
              id: 'setup.when.picker.howTo',
              message: 'Tap the first day and the last, or hold a day and drag.',
            })}
          </Text>
          {chips.length === 0 ? null : (
            <Row style={styles.chips}>
              {chips.map((chip, index) => (
                <ChoiceChip
                  key={chip.range.start}
                  label={windowChipLabel(
                    locale,
                    chip.range.start,
                    chip.range.end,
                    chip.free,
                    total,
                  )}
                  selected={sameRange(picked, chip.range)}
                  tilt={0}
                  onPress={() => choose(chip.range)}
                  testID={`picker-best-${index}`}
                />
              ))}
            </Row>
          )}
          <Heatmap
            key={focus.key}
            months={months}
            startIndex={focus.month}
            total={total}
            window={picked}
            anchor={pick.anchor}
            ghost={ghost}
            today={today}
            onSelectDay={(date) => setPick((current) => tapDay(current, date, ghost))}
            onDrag={onDrag}
            testID="picker"
          />
          <Stack style={styles.summary} accessibilityLiveRegion="polite">
            {shown === null ? null : (
              <Row justify="space-between" align="center">
                <Text
                  variant="title"
                  color={picked === null ? theme.semantic.text.secondary : undefined}
                  testID="picker-length"
                >
                  {lengthAndRange(locale, shown.start, shown.end, rangeLength(shown))}
                </Text>
                <TextLink
                  label={t({ id: 'setup.when.picker.clear', message: 'Clear' })}
                  onPress={() => setPick(EMPTY_PICK)}
                  testID="picker-clear"
                />
              </Row>
            )}
            {picked === null && ghost !== null ? (
              <Text variant="bodySm" color={theme.semantic.text.secondary} testID="picker-ghost">
                {t({
                  id: 'setup.when.picker.ghost',
                  message: 'Tap the outlined last day to take it, or tap another day.',
                })}
              </Text>
            ) : null}
            {problem === 'too_long' ? (
              <Text variant="bodySm" color={theme.semantic.state.urgent} testID="picker-too-long">
                {t({
                  id: 'setup.when.picker.tooLong',
                  message: `A trip can be ${max} days at most. Pick fewer days to lock it.`,
                })}
              </Text>
            ) : null}
            {picked !== null && problem === null ? (
              <Text variant="bodySm" color={theme.semantic.text.secondary} testID="picker-free">
                {t({
                  id: 'setup.when.picker.free',
                  message: `${who} of ${all} can make every day of it.`,
                })}
              </Text>
            ) : null}
          </Stack>
          {picked !== null && problem === null ? (
            <PillButton
              label={t({ id: 'setup.when.cta.lock', message: `Lock ${range}` })}
              loading={busy}
              onPress={() => onLock(picked.start, picked.end)}
              testID="picker-lock"
            />
          ) : null}
        </Stack>
      </SheetScrollView>
    </Sheet>
  );
}
