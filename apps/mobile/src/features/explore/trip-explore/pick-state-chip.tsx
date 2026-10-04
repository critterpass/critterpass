/**
 * Where a pick stands for the trip, at the foot of its card (7g-1): ♥ SAVED on paper when anyone
 * in the crew saved it, IN DAY 3 in blue when it is in the plan, or the yellow + that saves it to
 * Ideas in one tap.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { AddButton } from '@/ui/planning/add-button';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import * as copy from './copy';
import type { PickState } from './trip-explore-model';

export interface PickStateChipProps {
  readonly state: PickState;
  readonly placeName: string;
  readonly onSave: () => void;
  readonly testID?: string | undefined;
}

const useStyles = makeStyles((t) => ({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
    borderRadius: t.radius.md,
  },
  add: { alignSelf: 'flex-start', marginStart: -t.space['8'], marginBottom: -t.space['8'] },
}));

export function PickStateChip({ state, placeName, onSave, testID }: PickStateChipProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  if (state.kind === 'add') {
    return (
      <View style={styles.add}>
        <AddButton
          accessibilityLabel={copy.pickAddLabel(placeName)}
          onPress={onSave}
          size={28}
          testID={testID}
        />
      </View>
    );
  }
  const saved = state.kind === 'saved';
  return (
    <View
      style={[styles.chip, { backgroundColor: saved ? theme.color.paper.base : theme.color.blue }]}
      testID={testID}
    >
      <Text variant="label" color={saved ? theme.color.paper.ink : theme.color.ink[900]}>
        {upper(saved ? copy.pickSaved() : copy.pickInDay(state.dayNo), i18n.locale)}
      </Text>
    </View>
  );
}
