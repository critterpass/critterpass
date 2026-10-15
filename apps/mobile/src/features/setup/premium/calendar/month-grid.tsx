/**
 * One month of days in the premium look for the calendar sheets: the month name with ‹ › (link
 * blue), the weekday letters, and the shared day grid underneath (hold and drag sweeps across
 * days, a sideways swipe turns the month). Each day's cell is the caller's.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import { weekdayLetters } from '../../when/copy';
import { DayGrid, type DragHandlers } from './day-grid';

export interface MonthGridProps {
  readonly title: string;
  readonly weeks: readonly (readonly (string | null)[])[];
  readonly page: number;
  readonly pages: number;
  readonly onStep: (by: 1 | -1) => void;
  readonly renderDay: (date: string) => ReactNode;
  readonly onDrag?: DragHandlers | undefined;
  /** Something beside the month name (the window's tag). */
  readonly aside?: ReactNode;
  readonly testID?: string;
}

export function MonthGrid(props: MonthGridProps) {
  const theme = usePremiumTheme();
  const { t, i18n } = useLingui();
  const arrow = (by: 1 | -1) => {
    const off = by === -1 ? props.page <= 0 : props.page >= props.pages - 1;
    return (
      <PressableScale
        onPress={() => props.onStep(by)}
        disabled={off}
        accessibilityRole="button"
        accessibilityLabel={
          by === -1
            ? t({ id: 'setup.premium.month.previous', message: 'Previous month' })
            : t({ id: 'setup.premium.month.next', message: 'Next month' })
        }
        testID={`${props.testID ?? 'month'}-${by === -1 ? 'previous' : 'next'}`}
        style={{ padding: theme.space.gap4, opacity: off ? 0.3 : 1 }}
      >
        <Icon
          name={by === -1 ? 'back' : 'forward'}
          size={18}
          color={theme.color.status.rain.text}
        />
      </PressableScale>
    );
  };
  return (
    <View style={{ gap: theme.space.gap10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Text variant="headline" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
          {props.title}
        </Text>
        {props.aside ?? null}
        {arrow(-1)}
        {arrow(1)}
      </View>
      <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants">
        {weekdayLetters(i18n.locale).map((letter, at) => (
          <Text key={at} variant="badge" tone="muted" align="center" style={{ flex: 1 }}>
            {letter}
          </Text>
        ))}
      </View>
      <DayGrid
        weeks={props.weeks}
        renderDay={props.renderDay}
        onDrag={props.onDrag}
        onSwipe={props.pages > 1 ? props.onStep : undefined}
        testID={props.testID}
      />
    </View>
  );
}
