/**
 * "From your Critterdex" (3n-4): the forms the person found, four to a row, each in its rarity's
 * ring (rare blue, epic pink, legendary gold); the picked one wears the yellow ring.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { FormSticker } from '@/features/critters';
import { PressScale } from '@/ui/press/PressScale';
import { makeStyles, useTheme } from '@/ui/theme';

import type { OwnedForm } from './owned-forms';

const CELL = 72;
const RING = 3;

const useStyles = makeStyles((t) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space['12'] },
  cell: {
    width: CELL + RING * 2,
    height: CELL + RING * 2,
    borderRadius: (CELL + RING * 2) / 2,
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.color.paper.base,
  },
}));

export function FormGrid(props: {
  readonly forms: readonly OwnedForm[];
  readonly selected: string | null;
  readonly onPick: (key: string) => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.grid} accessibilityRole="radiogroup" testID="you-avatar-forms">
      {props.forms.map((form, index) => {
        const picked = props.selected === form.key;
        const ring = picked
          ? theme.color.yellow
          : form.ring === null
            ? theme.color.ink[600]
            : theme.tier[form.ring].color;
        return (
          <PressScale
            key={form.key}
            onPress={() => props.onPick(form.key)}
            widthClass="narrow"
            accessibilityRole="radio"
            accessibilityState={{ selected: picked }}
            accessibilityLabel={t({ id: 'you.avatar.formLabel', message: `Critter ${index + 1}` })}
            style={[styles.cell, { borderColor: ring }]}
            testID={`you-avatar-form-${index}`}
          >
            <FormSticker form={form.key} size={CELL - 10} />
          </PressScale>
        );
      })}
    </View>
  );
}
