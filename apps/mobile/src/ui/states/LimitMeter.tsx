import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PillButton } from '../buttons/PillButton';
import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface LimitMeterProps {
  /** What is metered ("Guide questions today"). */
  readonly label: string;
  readonly used: number;
  readonly limit: number;
  /** When it refills ("Resets at midnight"). */
  readonly resetLabel?: string;
  /** Quota exhausted: queue the ask for the reset ("Ask at midnight"). */
  readonly deferAction?: { readonly label: string; readonly onPress: () => void };
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  track: { flexDirection: 'row', gap: t.space['4'] },
  cell: { flex: 1, height: 10, borderRadius: t.radius.xs },
}));

/** A usage meter (4b-1): one cell per allowance, urgent when exhausted, with an ask-later option. */
export function LimitMeter({
  label,
  used,
  limit,
  resetLabel,
  deferAction,
  testID,
}: LimitMeterProps) {
  const styles = useStyles();
  const theme = useTheme();
  const exhausted = used >= limit;
  const fill = exhausted ? theme.semantic.state.urgent : theme.semantic.action.primary;
  const count = t({ id: 'common.limit.count', message: `${used} of ${limit} used` });
  return (
    <Stack gap="8" testID={testID}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: limit, now: Math.min(used, limit), text: count }}
      >
        <Stack gap="8">
          <Row justify="space-between" align="center">
            <Text variant="label">{label}</Text>
            <Text variant="label" color={exhausted ? theme.semantic.state.urgent : undefined}>
              {count}
            </Text>
          </Row>
          <View style={styles.track}>
            {Array.from({ length: limit }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.cell,
                  { backgroundColor: index < used ? fill : theme.semantic.bg.control },
                ]}
              />
            ))}
          </View>
        </Stack>
      </View>
      {resetLabel ? <SecondaryText variant="caption">{resetLabel}</SecondaryText> : null}
      {exhausted && deferAction ? (
        <PillButton
          size="sm"
          variant="secondary"
          label={deferAction.label}
          onPress={deferAction.onPress}
        />
      ) : null}
    </Stack>
  );
}
