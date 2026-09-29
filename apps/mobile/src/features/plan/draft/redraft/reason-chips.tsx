/**
 * What should change about the day: SLOWER, CHEAPER, LESS TRAIN, MORE FOOD, SWAP IT OUT, SURPRISE
 * ME, toggled like the taste chips from onboarding (each in its own accent, tilts alternating).
 */
import { REDRAFT_REASONS, type RedraftReason } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { makeStyles, useTheme, type Theme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['10'] },
}));

export function reasonLabel(reason: RedraftReason): string {
  switch (reason) {
    case 'slower':
      return t({ id: 'planDraft.reason.slower', message: 'Slower' });
    case 'cheaper':
      return t({ id: 'planDraft.reason.cheaper', message: 'Cheaper' });
    case 'less_train':
      return t({ id: 'planDraft.reason.lessTrain', message: 'Less train' });
    case 'more_food':
      return t({ id: 'planDraft.reason.moreFood', message: 'More food' });
    case 'swap_it_out':
      return t({ id: 'planDraft.reason.swap', message: 'Swap it out' });
    case 'surprise_me':
      return t({ id: 'planDraft.reason.surprise', message: 'Surprise me' });
  }
}

function accent(theme: Theme, reason: RedraftReason): string {
  switch (reason) {
    case 'slower':
      return theme.color.green.base;
    case 'cheaper':
      return theme.color.yellow;
    case 'less_train':
      return theme.color.pink;
    case 'more_food':
      return theme.color.orange;
    case 'swap_it_out':
      return theme.color.blue;
    case 'surprise_me':
      return theme.guide.paco;
  }
}

export interface ReasonChipsProps {
  readonly selected: ReadonlySet<RedraftReason>;
  readonly onToggle: (reason: RedraftReason) => void;
  readonly disabled?: boolean;
}

export function ReasonChips({ selected, onToggle, disabled = false }: ReasonChipsProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.wrap} testID="redraft-reasons">
      {REDRAFT_REASONS.map((reason, index) => (
        <ChoiceChip
          key={reason}
          label={reasonLabel(reason)}
          selected={selected.has(reason)}
          onPress={() => onToggle(reason)}
          accent={accent(theme, reason)}
          tilt={index % 2 === 0 ? -2 : 2}
          disabled={disabled}
          testID={`redraft-reason-${reason}`}
        />
      ))}
    </View>
  );
}
