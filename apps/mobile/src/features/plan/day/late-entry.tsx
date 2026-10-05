/**
 * "Running late" with its three answers (15, 30, 45 minutes), as a stop of today offers it: on the
 * stop's own sheet and under the day-of screen's hero. A tap names the minutes; the running-late
 * screen then shows what that does before anything changes.
 */
import { useLingui } from '@lingui/react/macro';

import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { ActionPill } from '@/ui/plan/ActionPill';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { LATE_STEPS } from './said-late';

export function LateEntry({
  onPick,
  testID = 'late-say',
}: {
  readonly onPick: (minutes: number) => void;
  readonly testID?: string;
}) {
  const theme = useTheme();
  const { t } = useLingui();
  const label = t({ id: 'plan.day.late.label', message: 'Running late?' });
  return (
    <Stack gap="8" testID={testID}>
      <Text variant="label" color={theme.semantic.text.secondary}>
        {label}
      </Text>
      <Row gap="8" wrap>
        {LATE_STEPS.map((minutes) => {
          const pill = t({ id: 'plan.day.late.minutes', message: `${minutes} min` });
          return (
            <ActionPill
              key={minutes}
              label={pill}
              tone="outline"
              accessibilityLabel={`${label} ${pill}`}
              onPress={() => onPick(minutes)}
              testID={`${testID}-${minutes}`}
            />
          );
        })}
      </Row>
    </Stack>
  );
}
