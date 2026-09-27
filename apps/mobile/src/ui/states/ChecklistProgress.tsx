import { View } from 'react-native';

import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export type ChecklistStepStatus = 'pending' | 'active' | 'done';

export interface ChecklistStep {
  readonly key: string;
  readonly label: string;
  readonly status: ChecklistStepStatus;
}

export interface ChecklistProgressProps {
  /** What the job is doing ("Building your Kyoto plan"). */
  readonly title: string;
  /** Real progress from the job; each step ticks as the server reports it. */
  readonly steps: readonly ChecklistStep[];
  readonly testID?: string;
}

const DOT = 22;

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.size.cardInner.max,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

/** An AI job's live checklist: pending steps outlined, the active one ringed, done ones ticked. */
export function ChecklistProgress({ title, steps, testID }: ChecklistProgressProps) {
  const styles = useStyles();
  const theme = useTheme();
  const done = steps.filter((step) => step.status === 'done').length;
  const active = steps.find((step) => step.status === 'active');
  return (
    <Stack gap="12" style={styles.card} testID={testID}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={title}
        accessibilityValue={{
          min: 0,
          max: steps.length,
          now: done,
          ...(active ? { text: active.label } : {}),
        }}
        accessibilityLiveRegion="polite"
      >
        <Text variant="title">{title}</Text>
      </View>
      <Stack gap="10" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {steps.map((step) => {
          const colour =
            step.status === 'done'
              ? theme.semantic.state.success
              : step.status === 'active'
                ? theme.semantic.action.primary
                : theme.semantic.border.control;
          return (
            <Row key={step.key} gap="10" align="center">
              <View
                style={[
                  styles.dot,
                  { borderColor: colour },
                  step.status === 'done' ? { backgroundColor: colour } : null,
                ]}
              >
                {step.status === 'done' ? (
                  <Icon name="check" size={12} color={theme.semantic.text.onAccent} decorative />
                ) : null}
              </View>
              <Text
                variant="body"
                color={step.status === 'pending' ? theme.semantic.text.secondary : undefined}
              >
                {step.label}
              </Text>
            </Row>
          );
        })}
      </Stack>
    </Stack>
  );
}
