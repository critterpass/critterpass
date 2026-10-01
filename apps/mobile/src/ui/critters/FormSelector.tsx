import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { PressScale } from '../press/PressScale';
import { makeStyles, useTheme } from '../theme';
import type { Tier } from './tier';
import { TierWord, tierColor, tierWord } from './tier';

export interface SelectableForm {
  readonly tier: Tier;
  readonly sticker: ReactNode;
  readonly found: boolean;
  /** What unlocks it ("Batur by sunrise"). */
  readonly requirement: string;
}

export interface FormSelectorProps {
  readonly forms: readonly SelectableForm[];
  readonly selected: Tier;
  readonly onSelect: (tier: Tier) => void;
  /** Group label ("Forms · 2 of 4"). */
  readonly label: string;
  readonly testID?: string;
}

const SHAKE_PT = 4;

const useStyles = makeStyles((th) => ({
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: th.space['4'],
    // Four cells share a row: a narrow side inset leaves the tier word ("✦ LEGENDARY") its width.
    paddingVertical: th.space['10'],
    paddingHorizontal: th.space['4'],
    borderRadius: th.radius.md,
    backgroundColor: th.semantic.bg.raised,
    borderWidth: th.space['2'],
  },
}));

function FormCell({
  form,
  checked,
  onSelect,
}: {
  readonly form: SelectableForm;
  readonly checked: boolean;
  readonly onSelect: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const x = useSharedValue(0);
  const [shakes, setShakes] = useState(0);
  useEffect(() => {
    if (shakes === 0 || reduced) return;
    const step = tokens.motion.duration.instant / 2;
    x.value = withSequence(
      withTiming(SHAKE_PT, { duration: step }),
      withTiming(-SHAKE_PT, { duration: step }),
      withTiming(0, { duration: step }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- x is a stable shared value ref.
  }, [shakes, reduced]);
  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const word = tierWord(form.tier);
  const need = form.requirement;
  const label = form.found
    ? word
    : t({ id: 'common.critter.formLocked', message: `${word}, locked: ${need}` });
  return (
    <Animated.View style={[{ flex: 1 }, shake]}>
      <PressScale
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        onPress={form.found ? onSelect : () => setShakes((n) => n + 1)}
        style={[
          styles.cell,
          { borderColor: checked ? tierColor(form.tier) : theme.semantic.bg.raised },
        ]}
      >
        {form.sticker}
        <TierWord tier={form.tier} glyph={false} fit />
        <SecondaryText variant="caption" style={{ textAlign: 'center' }}>
          {form.requirement}
        </SecondaryText>
      </PressScale>
    </Animated.View>
  );
}

/** Four form cells: found ones select, locked ones shake and keep their requirement visible. */
export function FormSelector({ forms, selected, onSelect, label, testID }: FormSelectorProps) {
  return (
    <Row gap="8" testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {forms.map((form) => (
        <FormCell
          key={form.tier}
          form={form}
          checked={form.tier === selected}
          onSelect={() => onSelect(form.tier)}
        />
      ))}
    </Row>
  );
}
