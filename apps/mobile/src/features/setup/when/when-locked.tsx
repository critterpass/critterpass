/**
 * The dates step once the dates are decided (undesigned; from the heatmap and its band): the
 * locked days as the yellow band with their length, "You're going {range}", and, for the
 * organiser while setup is still open, "Change the dates" (the picker). Members only read it.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';

import type { ShellFrame } from '../shell/frame';
import { SetupShell } from '../shell/setup-shell';
import { lengthAndRange, rangeLabel } from './copy';
import { Heatmap } from './heatmap';
import type { HeatMonth } from './model';
import { rangeLength, type DayRange } from './range';

export interface WhenLockedProps {
  readonly shell: ShellFrame;
  readonly tag: ReactNode;
  readonly locked: DayRange;
  readonly months: readonly HeatMonth[];
  readonly startMonth: number;
  readonly total: number;
  readonly today?: string | undefined;
  /** Why the last change did not go through. */
  readonly failure: ReactNode;
  /** Opens the picker; null for a member, and once setup has closed. */
  readonly onChange: (() => void) | null;
}

export function WhenLocked({
  shell,
  tag,
  locked,
  months,
  startMonth,
  total,
  today,
  failure,
  onChange,
}: WhenLockedProps) {
  const locale = useLocale();
  const range = rangeLabel(locale, locked.start, locked.end);
  return (
    <SetupShell
      {...shell}
      tag={tag}
      title={t({ id: 'setup.when.locked.title', message: 'The dates are set' })}
      line={t({ id: 'setup.when.locked.line', message: `You’re going ${range}.` })}
      testID="setup-when-locked"
      footer={
        onChange === null ? undefined : (
          <>
            {failure}
            <PillButton
              label={t({ id: 'setup.when.locked.change', message: 'Change the dates' })}
              variant="secondary"
              onPress={onChange}
              testID="when-change-dates"
            />
          </>
        )
      }
    >
      <Heatmap
        months={months}
        startIndex={startMonth}
        total={total}
        window={locked}
        today={today}
        windowLabel={lengthAndRange(locale, locked.start, locked.end, rangeLength(locked))}
      />
    </SetupShell>
  );
}
