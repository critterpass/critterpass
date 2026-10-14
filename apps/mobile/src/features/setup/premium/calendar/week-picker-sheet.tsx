/**
 * Pick your days in the premium look (undesigned; built from 4.10's heat calendar and the sheet
 * kit): "How many days?" as a segmented row, up to three best windows as pills, the crew's heat
 * calendar to tap a first and last day on (or hold and drag either end), the ghost of the planned
 * length after a first tap, and under it what is picked, who can make every day, and Lock. Only
 * counts, never anyone's days. The pick itself is the shared `useWeekPick`.
 */
import { TRIP_LENGTH_MAX_DAYS } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { OverlaySheet } from '@/features/plan';
import { useLocale } from '@/lib/i18n/use-locale';
import { Button, SegmentedControl, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import {
  countWord,
  lengthAndRange,
  monthLabel,
  rangeLabel,
  sentenceStart,
  windowChipLabel,
} from '../../when/copy';
import { weeksOfDates, type DragHandlers } from './day-grid';
import type { HeatDay, HeatMonth } from '../../when/model';
import { LENGTH_CHOICES, rangeLength, type DayRange, type RangePick } from '../../when/range';
import { sameRange, useWeekPick } from '../../when/use-week-pick';
import type { WeekPickerProps } from '../../when/when-props';
import { heatShare } from '../steps/heat-calendar';
import { MonthGrid } from './month-grid';

const inside = (range: DayRange | null, date: string) =>
  range !== null && date >= range.start && date <= range.end;

function PickCalendar(props: {
  readonly months: readonly HeatMonth[];
  readonly startIndex: number;
  readonly total: number;
  readonly pick: RangePick;
  readonly ghost: DayRange | null;
  readonly open: (date: string) => boolean;
  readonly onTap: (date: string) => void;
  readonly onDrag: DragHandlers;
}) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const [page, setPage] = useState(props.startIndex);
  const month = props.months[Math.max(0, Math.min(page, props.months.length - 1))];
  if (month === undefined) return null;
  const byDate = new Map<string, HeatDay>(month.days.map((day) => [day.date, day]));
  const renderDay = (date: string) => {
    const day = byDate.get(date);
    const picked = inside(props.pick.range, date);
    const ghosted = !picked && inside(props.ghost, date);
    const anchored = props.pick.anchor === date;
    const share = heatShare(day?.free ?? 0, props.total);
    const free = day?.free ?? 0;
    return (
      <Pressable
        onPress={() => props.onTap(date)}
        disabled={!props.open(date)}
        accessibilityRole="button"
        accessibilityState={{ selected: picked || anchored }}
        accessibilityLabel={`${String(day?.day ?? Number(date.slice(8)))}: ${String(free)}/${String(props.total)}`}
        testID={`picker-day-${date}`}
        style={{
          height: 44,
          borderRadius: theme.radius.dayBadge,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          opacity: props.open(date) ? 1 : 0.35,
          backgroundColor: picked ? theme.color.ink : theme.color.ground,
          ...(ghosted || anchored
            ? {
                borderWidth: 2,
                borderColor: theme.color.ink,
                borderStyle: anchored ? 'solid' : 'dashed',
              }
            : {}),
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
          {String(Number(date.slice(8)))}
        </Text>
        {props.total > 1 && free > 0 ? (
          <Text variant="badge" tone={picked ? 'onInk' : 'inkSecondary'} style={{ opacity: 0.75 }}>
            {`${String(free)}/${String(props.total)}`}
          </Text>
        ) : null}
      </Pressable>
    );
  };
  return (
    <MonthGrid
      title={monthLabel(locale, month.year, month.month)}
      weeks={weeksOfDates(
        month.leadingBlanks,
        month.days.map((day) => day.date),
      )}
      page={page}
      pages={props.months.length}
      onStep={(by) => setPage((at) => Math.max(0, Math.min(props.months.length - 1, at + by)))}
      renderDay={renderDay}
      onDrag={props.onDrag}
      testID="picker"
    />
  );
}

export function PremiumWeekPicker(props: WeekPickerProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const state = useWeekPick(props);
  const { pick, ghost, picked, problem, chips } = state;
  const max = TRIP_LENGTH_MAX_DAYS;
  const who = sentenceStart(countWord(state.freeAll));
  const all = countWord(props.total);
  const range = picked === null ? '' : rangeLabel(locale, picked.start, picked.end);
  return (
    <OverlaySheet
      tall
      title={t({ id: 'setup.when.picker.titleDays', message: 'Pick your days' })}
      line={t({
        id: 'setup.when.picker.howTo',
        message: 'Say how many days, then tap the first day. Or tap a first and a last day.',
      })}
      closeLabel={t({ id: 'setup.premium.calendar.close', message: 'Close' })}
      onDismiss={props.onDismiss}
      footer={
        <View style={{ gap: theme.space.gap4 }} accessibilityLiveRegion="polite">
          {picked === null ? null : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                variant="rowTitle"
                tone={pick.range === null ? 'muted' : 'ink'}
                style={{ flex: 1 }}
                testID="picker-length"
              >
                {lengthAndRange(locale, picked.start, picked.end, rangeLength(picked))}
              </Text>
              <TextButton
                label={t({ id: 'setup.when.picker.clear', message: 'Clear' })}
                onPress={state.clear}
                testID="picker-clear"
              />
            </View>
          )}
          {pick.range === null && ghost !== null ? (
            <Text variant="caption" tone="muted" testID="picker-ghost">
              {t({
                id: 'setup.when.picker.ghostLock',
                message: 'Lock it, or tap another last day.',
              })}
            </Text>
          ) : null}
          {problem === 'too_long' ? (
            <Text
              variant="caption"
              color={theme.color.status.voteOpen.text}
              testID="picker-too-long"
            >
              {t({
                id: 'setup.when.picker.tooLong',
                message: `A trip can be ${max} days at most. Pick fewer days to lock it.`,
              })}
            </Text>
          ) : null}
          {picked !== null && problem === null && props.total > 1 ? (
            <Text variant="caption" tone="muted" testID="picker-free">
              {t({
                id: 'setup.when.picker.free',
                message: `${who} of ${all} can make every day of it.`,
              })}
            </Text>
          ) : null}
          {props.failure == null ? null : (
            <Text
              variant="caption"
              color={theme.color.status.voteOpen.text}
              testID="picker-failure"
            >
              {props.failure}
            </Text>
          )}
          {picked === null ? null : (
            <Button
              label={t({ id: 'setup.when.cta.lock', message: `Lock ${range}` })}
              loading={props.busy}
              disabled={problem !== null}
              onPress={() => props.onLock(picked.start, picked.end)}
              testID="picker-lock"
            />
          )}
        </View>
      }
      testID="week-picker"
    >
      <Text variant="label" tone="muted">
        {t({ id: 'setup.when.picker.howLong', message: 'How many days?' })}
      </Text>
      <SegmentedControl
        options={LENGTH_CHOICES.map((days) => ({ value: String(days), label: String(days) }))}
        value={String(state.lengthShown)}
        onChange={(days) => state.sayLength(Number(days))}
        accessibilityLabel={t({ id: 'setup.when.picker.howLong', message: 'How many days?' })}
        testID="picker-lengths"
      />
      {chips.length === 0 ? null : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap6 }}>
          {chips.map((chip, index) => (
            <Button
              alignSelf="auto"
              key={chip.range.start}
              size="small"
              variant={sameRange(pick.range, chip.range) ? 'primary' : 'control'}
              label={windowChipLabel(
                locale,
                chip.range.start,
                chip.range.end,
                chip.free,
                props.total,
              )}
              onPress={() => state.choose(chip.range)}
              testID={`picker-best-${index}`}
            />
          ))}
        </View>
      )}
      <PickCalendar
        key={state.focus.key}
        months={props.months}
        startIndex={state.focus.month}
        total={props.total}
        pick={pick}
        ghost={ghost}
        open={state.open}
        onTap={state.tap}
        onDrag={state.onDrag}
      />
    </OverlaySheet>
  );
}
