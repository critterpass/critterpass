/**
 * Picking the trip's days by hand (undesigned; "Pick the dates" / "Pick other days"): "How many
 * days?" as one-tap choices (the ghost and the suggested windows follow it), up to three best
 * windows as chips (none starting within the next few days), the same heatmap to tap a first and last day on (or hold and drag),
 * a ghost of the planned length after the first tap that Lock takes as it stands (another tap
 * re-picks its last day), and the length, who can make every day of it and Lock, live under the
 * calendar. Only counts, never anyone's days.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

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
import { Heatmap } from './heatmap';
import type { HeatMonth } from './model';
import { LENGTH_CHOICES, rangeLength, type RangePick } from './range';
import { sameRange, useWeekPick } from './use-week-pick';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['16'], gap: th.space['10'] },
  chips: { flexWrap: 'wrap', gap: th.space['8'] },
  summary: { gap: th.space['4'] },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingTop: th.space['8'],
    paddingBottom: th.space['8'],
    gap: th.space['10'],
  },
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
  /** Why the last lock did not go through, said on the sheet itself (the step is behind it). */
  readonly failure?: string | null;
  readonly onLock: (start: string, end: string) => void;
  readonly onDismiss: () => void;
  /** Opens on this pick (the lab's scenes). */
  readonly initialPick?: RangePick | undefined;
}

export function WeekPicker({
  months,
  startMonth,
  total,
  lengthDays,
  today,
  busy,
  failure = null,
  onLock,
  onDismiss,
  initialPick,
}: WeekPickerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const state = useWeekPick({ months, startMonth, total, lengthDays, today, initialPick });
  const { pick, ghost, picked, problem, focus, chips, onDrag } = state;
  const shown = picked;

  const title = t({ id: 'setup.when.picker.titleDays', message: 'Pick your days' });
  const who = sentenceStart(countWord(state.freeAll));
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
              message: 'Say how many days, then tap the first day. Or tap a first and a last day.',
            })}
          </Text>
          <Text variant="eyebrow">
            {t({ id: 'setup.when.picker.howLong', message: 'How many days?' })}
          </Text>
          <Row style={styles.chips} testID="picker-lengths">
            {LENGTH_CHOICES.map((days) => (
              <ChoiceChip
                key={days}
                // Numbers alone, so the five choices sit on one line under "How many days?".
                label={String(days)}
                selected={state.lengthShown === days}
                tilt={0}
                onPress={() => state.sayLength(days)}
                testID={`picker-length-${days}`}
              />
            ))}
          </Row>
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
                  selected={sameRange(pick.range, chip.range)}
                  tilt={0}
                  onPress={() => state.choose(chip.range)}
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
            window={pick.range}
            anchor={pick.anchor}
            ghost={ghost}
            today={today}
            onSelectDay={state.tap}
            onDrag={onDrag}
            flat
            testID="picker"
          />
        </Stack>
      </SheetScrollView>
      {/* Under the calendar, outside the scroll (the calendar takes drags, so what sits under it
          could not be scrolled to): what is picked and the lock stay in view however tall the
          sheet's content. */}
      <View style={styles.footer}>
        <Stack style={styles.summary} accessibilityLiveRegion="polite">
          {shown === null ? null : (
            <Row justify="space-between" align="center">
              <Text
                variant="title"
                color={pick.range === null ? theme.semantic.text.secondary : undefined}
                testID="picker-length"
              >
                {lengthAndRange(locale, shown.start, shown.end, rangeLength(shown))}
              </Text>
              <TextLink
                label={t({ id: 'setup.when.picker.clear', message: 'Clear' })}
                onPress={state.clear}
                testID="picker-clear"
              />
            </Row>
          )}
          {pick.range === null && ghost !== null ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary} testID="picker-ghost">
              {t({
                id: 'setup.when.picker.ghostLock',
                message: 'Lock it, or tap another last day.',
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
          {picked !== null && problem === null && total > 1 ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary} testID="picker-free">
              {t({
                id: 'setup.when.picker.free',
                message: `${who} of ${all} can make every day of it.`,
              })}
            </Text>
          ) : null}
        </Stack>
        {failure === null ? null : (
          <Text variant="bodySm" color={theme.semantic.state.urgent} testID="picker-failure">
            {failure}
          </Text>
        )}
        {/* A range too long to lock keeps its button, dimmed, so the sheet's end does not jump. */}
        {picked !== null ? (
          <PillButton
            label={t({ id: 'setup.when.cta.lock', message: `Lock ${range}` })}
            loading={busy}
            disabled={problem !== null}
            onPress={() => onLock(picked.start, picked.end)}
            testID="picker-lock"
          />
        ) : null}
      </View>
    </Sheet>
  );
}
