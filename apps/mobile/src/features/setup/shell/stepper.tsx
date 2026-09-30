/**
 * The setup wizard's four step chips (WHEN · BUDGET · ROOMS · MUST-DOS): the step on screen in
 * yellow, locked steps with a check in green, the rest numbered. A chip is a button when it can be
 * opened: any locked step, and the step setup is on now. A chip pops as its step locks.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { patterns } from '@/motion';
import { PressScale } from '@/ui/press/PressScale';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { WIZARD_STEPS, type WizardStep } from './steps';

export type ChipState = 'active' | 'done' | 'upcoming';

export function chipState(
  step: WizardStep,
  viewing: WizardStep,
  doneSteps: ReadonlySet<WizardStep>,
): ChipState {
  if (step === viewing) return 'active';
  if (doneSteps.has(step)) return 'done';
  return 'upcoming';
}

export function stepTitle(step: WizardStep): string {
  switch (step) {
    case 'when':
      return t({ id: 'setup.stepper.when', message: 'When' });
    case 'budget':
      return t({ id: 'setup.stepper.budget', message: 'Budget' });
    case 'rooms':
      return t({ id: 'setup.stepper.rooms', message: 'Rooms' });
    case 'must_dos':
      return t({ id: 'setup.stepper.mustDos', message: 'Must-dos' });
  }
}

const useStyles = makeStyles((th) => ({
  row: { gap: th.space['6'] },
  cell: { flex: 1 },
  chip: {
    height: th.space['32'] + th.space['8'],
    borderRadius: th.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: th.space['4'],
  },
}));

interface ChipProps {
  readonly step: WizardStep;
  readonly index: number;
  readonly state: ChipState;
  readonly onPress: (() => void) | null;
}

function Chip({ step, index, state, onPress }: ChipProps) {
  const styles = useStyles();
  const theme = useTheme();
  // Pops only as the step locks, not when the screen opens on an already-locked step.
  const [openedDone] = useState(state === 'done');
  const pop = patterns.useSquash({ active: state === 'done' && !openedDone });
  const title = stepTitle(step);
  const n = index + 1;
  const label = state === 'done' ? `✓ ${title}` : `${n} ${title}`;
  const fill = state === 'active' ? theme.semantic.action.primary : theme.semantic.bg.raised;
  const ink =
    state === 'active'
      ? theme.semantic.text.onAccent
      : state === 'done'
        ? theme.semantic.state.success
        : theme.semantic.text.secondary;
  const spoken =
    state === 'done'
      ? t({ id: 'setup.stepper.a11yDone', message: `Step ${n}, ${title}, done` })
      : t({ id: 'setup.stepper.a11y', message: `Step ${n}, ${title}` });
  const face = (
    <Animated.View
      style={[styles.chip, { backgroundColor: fill }, state === 'done' && !openedDone ? pop : null]}
    >
      <Text
        variant="label"
        color={ink}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {label}
      </Text>
    </Animated.View>
  );
  if (onPress === null) {
    return (
      <View
        style={styles.cell}
        accessible
        accessibilityLabel={spoken}
        accessibilityState={{ selected: state === 'active', disabled: true }}
        testID={`setup-step-${step}`}
      >
        {face}
      </View>
    );
  }
  return (
    <View style={styles.cell}>
      <PressScale
        onPress={onPress}
        accessibilityLabel={spoken}
        accessibilityState={{ selected: state === 'active' }}
        testID={`setup-step-${step}`}
      >
        {face}
      </PressScale>
    </View>
  );
}

export interface StepperProps {
  readonly viewing: WizardStep;
  readonly doneSteps: ReadonlySet<WizardStep>;
  /** Steps that open when tapped (locked ones and the one setup is on). */
  readonly openable: ReadonlySet<WizardStep>;
  readonly onSelect: (step: WizardStep) => void;
}

export function Stepper({ viewing, doneSteps, openable, onSelect }: StepperProps) {
  const styles = useStyles();
  return (
    <Row style={styles.row} accessibilityRole="tablist">
      {WIZARD_STEPS.map((step, index) => {
        const state = chipState(step, viewing, doneSteps);
        const tappable = state !== 'active' && openable.has(step);
        return (
          <Chip
            key={step}
            step={step}
            index={index}
            state={state}
            onPress={tappable ? () => onSelect(step) : null}
          />
        );
      })}
    </Row>
  );
}
