/**
 * How a hand-marked day looks, shared by the grid and its legend: Free and Busy filled with their
 * state colour, Maybe on the control fill with a dashed warning edge, each with its glyph and
 * word, so no state is told by colour alone.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme, type Theme } from '@/ui/theme';

import type { ManualMark } from './manual-days';

export const GLYPH: Readonly<Record<ManualMark, string>> = { free: '✓', busy: '✕', maybe: '?' };

const useStyles = makeStyles((th) => ({
  box: {
    borderRadius: th.radius.sm,
    minHeight: th.space['32'] + th.space['12'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  maybe: { borderWidth: th.space['2'], borderStyle: 'dashed' },
  swatch: { width: th.space['12'], height: th.space['12'], borderRadius: th.radius.xs },
}));

function markColour(theme: Theme, mark: ManualMark | undefined): string {
  switch (mark) {
    case 'free':
      return theme.semantic.state.success;
    case 'busy':
      return theme.semantic.state.urgent;
    case 'maybe':
    case undefined:
      return theme.semantic.bg.control;
  }
}

export function markWord(mark: ManualMark | undefined): string {
  switch (mark) {
    case 'free':
      return t({ id: 'setup.manual.free', message: 'Free' });
    case 'busy':
      return t({ id: 'setup.manual.busy', message: 'Busy' });
    case 'maybe':
      return t({ id: 'setup.manual.maybe', message: 'Maybe' });
    case undefined:
      return t({ id: 'setup.manual.unmarked', message: 'Not marked' });
  }
}

function useMarkLook(mark: ManualMark | undefined) {
  const styles = useStyles();
  const theme = useTheme();
  const filled = mark === 'free' || mark === 'busy';
  return {
    style: [
      { backgroundColor: markColour(theme, mark) },
      mark === 'maybe' ? [styles.maybe, { borderColor: theme.semantic.state.warning }] : null,
    ],
    ink: filled ? theme.semantic.text.onAccent : theme.semantic.text.primary,
  };
}

export function DayFace({
  date,
  mark,
  open,
}: {
  readonly date: string;
  readonly mark: ManualMark | undefined;
  readonly open: boolean;
}) {
  const styles = useStyles();
  const look = useMarkLook(mark);
  return (
    <View style={[styles.box, look.style, { opacity: open ? 1 : 0.35 }]}>
      <Text variant="label" color={look.ink}>
        {String(Number(date.slice(8)))}
      </Text>
      {mark === undefined ? null : (
        <Text variant="caption" color={look.ink}>
          {GLYPH[mark]}
        </Text>
      )}
    </View>
  );
}

export function Swatch({ mark }: { readonly mark: ManualMark }) {
  const styles = useStyles();
  const look = useMarkLook(mark);
  return <View style={[styles.swatch, look.style]} />;
}
