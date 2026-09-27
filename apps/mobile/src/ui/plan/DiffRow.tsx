import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import Animated from 'react-native-reanimated';

import { useFlap } from '@/motion/patterns/flap';

import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { SecondaryText } from '../cards/SecondaryText';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { ActionPill } from './ActionPill';

export type DiffDecision = 'pending' | 'kept' | 'rejected';

export interface DiffRowProps {
  /** What it was ("14:00 Ridge walk"), shown struck through. */
  readonly before: string;
  /** What it becomes ("17:00 Ridge walk"), shown bold. */
  readonly after: string;
  readonly reason?: string;
  /** Avatars of the people affected. */
  readonly people?: ReactNode;
  readonly decision: DiffDecision;
  readonly onKeep?: () => void;
  readonly onReject?: () => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  row: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
  },
}));

/** One proposed change: old struck, new bold, reason, affected people and a keep/reject toggle. */
export function DiffRow({
  before,
  after,
  reason,
  people,
  decision,
  onKeep,
  onReject,
  testID,
}: DiffRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { displayValue, style: flapStyle } = useFlap({ value: decision });
  const state =
    displayValue === 'kept'
      ? t({ id: 'common.plan.changeKept', message: 'Kept' })
      : displayValue === 'rejected'
        ? t({ id: 'common.plan.changeRejected', message: 'Rejected' })
        : undefined;
  const summary = t({
    id: 'common.plan.diffSummary',
    message: `Changed from ${before} to ${after}`,
  });
  return (
    <Row gap="12" align="center" style={styles.row} testID={testID}>
      <Stack
        gap="4"
        flex={1}
        accessible
        accessibilityRole="text"
        accessibilityLabel={[summary, reason, state].filter(Boolean).join(', ')}
      >
        <SecondaryText style={{ textDecorationLine: 'line-through' }}>{before}</SecondaryText>
        <Text variant="title" style={decision === 'rejected' ? { opacity: 0.45 } : null}>
          {after}
        </Text>
        {reason ? <SecondaryText>{reason}</SecondaryText> : null}
        {people}
      </Stack>
      <Animated.View style={[{ flexDirection: 'row', gap: theme.space['6'] }, flapStyle]}>
        <ActionPill
          round
          label="✕"
          icon={
            <Text
              variant="buttonSm"
              color={decision === 'rejected' ? theme.semantic.text.onAccent : undefined}
            >
              ✕
            </Text>
          }
          tone={decision === 'rejected' ? 'urgent' : 'secondary'}
          selected={decision === 'rejected'}
          accessibilityLabel={t({ id: 'common.plan.rejectChange', message: 'Reject this change' })}
          {...(onReject ? { onPress: onReject } : {})}
        />
        <ActionPill
          round
          label="✓"
          icon={
            <Icon
              name="check"
              size={theme.space['20']}
              decorative
              color={
                decision === 'kept' ? theme.semantic.text.onAccent : theme.semantic.text.primary
              }
            />
          }
          tone={decision === 'kept' ? 'success' : 'secondary'}
          selected={decision === 'kept'}
          accessibilityLabel={t({ id: 'common.plan.keepChange', message: 'Keep this change' })}
          {...(onKeep ? { onPress: onKeep } : {})}
        />
      </Animated.View>
    </Row>
  );
}
