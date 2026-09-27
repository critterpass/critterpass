import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface Step {
  readonly label: string;
  readonly done?: boolean;
}

export interface StepTabsProps {
  readonly steps: readonly Step[];
  /** 0-based current step. */
  readonly current: number;
  /** Lets done steps be revisited. */
  readonly onSelect?: (index: number) => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  tab: { flex: 1, gap: th.space['4'], paddingTop: th.space['8'] },
  bar: { height: th.space['4'], borderRadius: th.radius.xs },
}));

/** Wizard step strip ("1 When · 2 Budget · 3 Rooms · 4 Must-dos"); done steps show ✓. */
export function StepTabs({ steps, current, onSelect, testID }: StepTabsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const total = steps.length;
  return (
    <Row gap="6" testID={testID} accessibilityRole="tablist">
      {steps.map((step, index) => {
        const active = index === current;
        const n = index + 1;
        const name = step.label;
        const spoken = step.done
          ? t({ id: 'common.story.stepDone', message: `Step ${n} of ${total}, ${name}, done` })
          : t({ id: 'common.story.step', message: `Step ${n} of ${total}, ${name}` });
        const color = active
          ? theme.semantic.action.primary
          : step.done
            ? theme.semantic.state.success
            : theme.semantic.bg.control;
        return (
          <PressScale
            key={name}
            accessibilityRole="tab"
            accessibilityLabel={spoken}
            accessibilityState={{ selected: active }}
            disabled={!onSelect || active || !step.done}
            {...(onSelect ? { onPress: () => onSelect(index) } : {})}
            style={styles.tab}
          >
            <View style={[styles.bar, { backgroundColor: color }]} />
            <Text
              variant="label"
              color={active ? theme.semantic.text.primary : theme.semantic.text.secondary}
              numberOfLines={1}
            >
              {step.done ? `✓ ${name}` : `${n} ${name}`}
            </Text>
          </PressScale>
        );
      })}
    </Row>
  );
}
