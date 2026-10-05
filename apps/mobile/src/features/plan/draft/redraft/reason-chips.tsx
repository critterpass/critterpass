/**
 * What should change about the day: the reason chips the server offers (`REDRAFT_REASON_CHIPS`:
 * SLOWER, LIGHTER DAY, LATER START, LESS TRAVEL, CHEAPER, MORE FOOD, SWAP IT OUT, SURPRISE ME),
 * toggled like the taste chips from onboarding (each in its own accent, tilts alternating).
 */
import { REDRAFT_REASON_CHIPS, type RedraftReasonKey } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { makeStyles, useTheme, type Theme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['10'] },
}));

export function reasonLabel(reason: RedraftReasonKey): string {
  switch (reason) {
    case 'slower':
      return t({ id: 'planDraft.reason.slower', message: 'Slower' });
    case 'lighter_day':
      return t({ id: 'planDraft.reason.lighterDay', message: 'Lighter day' });
    case 'later_start':
      return t({ id: 'planDraft.reason.laterStart', message: 'Later start' });
    // `less_train` is an earlier build's chip, read the same way: less time getting around.
    case 'less_train':
    case 'less_travel':
      return t({ id: 'planDraft.reason.lessTravel', message: 'Less travel' });
    case 'cheaper':
      return t({ id: 'planDraft.reason.cheaper', message: 'Cheaper' });
    case 'more_food':
      return t({ id: 'planDraft.reason.moreFood', message: 'More food' });
    case 'swap_it_out':
      return t({ id: 'planDraft.reason.swap', message: 'Swap it out' });
    case 'surprise_me':
      return t({ id: 'planDraft.reason.surprise', message: 'Surprise me' });
  }
}

function accent(theme: Theme, reason: RedraftReasonKey): string {
  switch (reason) {
    case 'slower':
    case 'lighter_day':
      return theme.color.green.base;
    case 'cheaper':
      return theme.color.yellow;
    case 'less_travel':
    case 'less_train':
      return theme.color.pink;
    case 'more_food':
    case 'later_start':
      return theme.color.orange;
    case 'swap_it_out':
      return theme.color.blue;
    case 'surprise_me':
      return theme.guide.paco;
  }
}

export interface ReasonChipsProps {
  readonly selected: ReadonlySet<RedraftReasonKey>;
  readonly onToggle: (reason: RedraftReasonKey) => void;
  readonly disabled?: boolean;
}

export function ReasonChips({ selected, onToggle, disabled = false }: ReasonChipsProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.wrap} testID="redraft-reasons">
      {REDRAFT_REASON_CHIPS.map(({ key }, index) => (
        <ChoiceChip
          key={key}
          label={reasonLabel(key)}
          selected={selected.has(key)}
          onPress={() => onToggle(key)}
          accent={accent(theme, key)}
          tilt={index % 2 === 0 ? -2 : 2}
          disabled={disabled}
          testID={`redraft-reason-${key}`}
        />
      ))}
    </View>
  );
}
