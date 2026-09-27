import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill, Tag } from '../plan/ActionPill';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export type SettleStatus = 'requested' | 'paid' | 'pending';

export interface SettleParty {
  readonly name: string;
  readonly avatar: ReactNode;
}

export interface SettleRowProps {
  readonly from: SettleParty;
  readonly to: SettleParty;
  /** Pre-formatted amount ("$92.10"). */
  readonly amount: string;
  readonly status: SettleStatus;
  /** Status tag text ("Requested", "Paid ✓", "Pending"). */
  readonly statusLabel: string;
  readonly onNudge?: () => void;
  readonly onPress?: () => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  row: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
  },
  dash: {
    flex: 1,
    borderTopWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
  },
}));

/** One netted payment: from → amount → to, with its status and a nudge when requested. */
export function SettleRow({
  from,
  to,
  amount,
  status,
  statusLabel,
  onNudge,
  onPress,
  testID,
}: SettleRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const payer = from.name;
  const payee = to.name;
  const summary = t({
    id: 'common.money.settleSummary',
    message: `${payer} pays ${payee} ${amount}`,
  });
  const tagColor =
    status === 'paid'
      ? theme.semantic.state.success
      : status === 'requested'
        ? theme.semantic.action.primary
        : undefined;
  const flow = (
    <Row gap="8" align="center" flex={1}>
      {from.avatar}
      <View style={styles.dash} />
      <Text variant="h3">{amount}</Text>
      <View style={styles.dash} />
      {to.avatar}
    </Row>
  );
  return (
    <Row gap="10" align="center" style={styles.row} testID={testID}>
      {onPress ? (
        <PressScale
          accessibilityLabel={`${summary}, ${statusLabel}`}
          onPress={onPress}
          widthClass="wide"
          style={{ flex: 1 }}
        >
          {flow}
        </PressScale>
      ) : (
        <View
          style={{ flex: 1 }}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${summary}, ${statusLabel}`}
        >
          {flow}
        </View>
      )}
      <Stack gap="4" align="flex-end">
        <Tag label={statusLabel} {...(tagColor ? { color: tagColor } : {})} />
        {status === 'requested' && onNudge ? (
          <ActionPill
            tone="outline"
            label={t({ id: 'common.money.nudge', message: 'Nudge' })}
            accessibilityLabel={t({ id: 'common.money.nudgePerson', message: `Nudge ${payer}` })}
            onPress={onNudge}
          />
        ) : null}
      </Stack>
    </Row>
  );
}
