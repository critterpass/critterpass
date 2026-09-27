import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Text } from '../text/Text';
import type { Theme } from '../theme';
import { makeStyles, useTheme } from '../theme';

export type ChipStatus =
  | 'booked'
  | 'vote'
  | 'in'
  | 'maybe'
  | 'unopened'
  | 'planned'
  | 'building'
  | 'ended'
  | 'live'
  | 'free'
  | 'boost'
  | 'passPlus';

export interface StatusChipProps {
  readonly status: ChipStatus;
  /** Overrides the default word ("Vote · 2 left"). */
  readonly label?: string;
  readonly testID?: string;
}

export function statusWord(status: ChipStatus): string {
  switch (status) {
    case 'booked':
      return t({ id: 'common.status.booked', message: 'Booked' });
    case 'vote':
      return t({ id: 'common.status.vote', message: 'Vote' });
    case 'in':
      return t({ id: 'common.status.in', message: 'In' });
    case 'maybe':
      return t({ id: 'common.status.maybe', message: 'Maybe' });
    case 'unopened':
      return t({ id: 'common.status.unopened', message: 'Unopened' });
    case 'planned':
      return t({ id: 'common.status.planned', message: 'Planned' });
    case 'building':
      return t({ id: 'common.status.building', message: 'Building' });
    case 'ended':
      return t({ id: 'common.status.ended', message: 'Ended' });
    case 'live':
      return t({ id: 'common.status.live', message: 'Live' });
    case 'free':
      return t({ id: 'common.status.free', message: 'Free' });
    case 'boost':
      return t({ id: 'common.status.boost', message: 'Boost' });
    case 'passPlus':
      return t({ id: 'common.status.passPlus', message: 'Pass+' });
  }
}

function fillFor(theme: Theme, status: ChipStatus): { bg: string; fg: string } {
  const onAccent = theme.semantic.text.onAccent;
  switch (status) {
    case 'booked':
    case 'in':
      return { bg: theme.semantic.state.success, fg: onAccent };
    case 'vote':
    case 'live':
      return { bg: theme.semantic.state.urgent, fg: onAccent };
    case 'boost':
      return { bg: theme.semantic.brand.boost, fg: onAccent };
    case 'maybe':
      return { bg: theme.semantic.state.warning, fg: onAccent };
    case 'planned':
      return { bg: theme.semantic.state.info, fg: onAccent };
    case 'building':
      return { bg: theme.semantic.action.primary, fg: onAccent };
    case 'passPlus':
      return { bg: theme.semantic.brand.passplus, fg: onAccent };
    case 'unopened':
    case 'ended':
    case 'free':
      return { bg: theme.semantic.bg.control, fg: theme.semantic.text.secondary };
  }
}

const useStyles = makeStyles((t) => ({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: t.radius.xs,
    paddingHorizontal: t.space['6'],
    paddingVertical: t.space['2'],
  },
}));

/** A word status tag (never colour alone): Booked, Vote, In, Maybe, Planned, Pass+, … */
export function StatusChip({ status, label, testID }: StatusChipProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { bg, fg } = fillFor(theme, status);
  return (
    <View testID={testID} style={[styles.chip, { backgroundColor: bg }]}>
      <Text variant="label" color={fg}>
        {label ?? statusWord(status)}
      </Text>
    </View>
  );
}
