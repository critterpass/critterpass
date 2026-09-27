import { t } from '@lingui/core/macro';

import { PillButton } from '../buttons/PillButton';
import { HoldRing } from '../inputs/HoldRing';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface ConfirmSheetProps {
  readonly title: string;
  /** Everything that will happen, one line each ("Your 12 expenses stay with the crew"). */
  readonly consequences: readonly string[];
  /** The destructive verb ("Leave crew", "Delete account"). */
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** `hold` asks for a pink hold ring (irreversible, high stakes); `button` a destructive pill. */
  readonly mode?: 'hold' | 'button';
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: t.space['8'],
    backgroundColor: t.semantic.state.urgent,
  },
}));

/** Destructive confirmation body for a `Sheet`: title, consequences, then hold or confirm, or cancel. */
export function ConfirmSheet({
  title,
  consequences,
  confirmLabel,
  onConfirm,
  onCancel,
  mode = 'button',
  testID,
}: ConfirmSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack gap="16" testID={testID}>
      <Text variant="h2" accessibilityRole="header">
        {title}
      </Text>
      <Stack gap="8">
        {consequences.map((line) => (
          <Row key={line} gap="10" align="flex-start">
            <Stack style={styles.bullet} />
            <Text variant="body" style={{ flex: 1 }}>
              {line}
            </Text>
          </Row>
        ))}
      </Stack>
      {mode === 'hold' ? (
        <Stack align="center" gap="8">
          <HoldRing
            label={t({ id: 'common.confirm.hold', message: 'Hold' })}
            actionLabel={confirmLabel}
            tone="pink"
            confirmMessage={consequences.join('\n')}
            onComplete={onConfirm}
          />
          <Text variant="label" color={theme.semantic.state.urgent}>
            {confirmLabel}
          </Text>
        </Stack>
      ) : (
        <PillButton variant="destructive" label={confirmLabel} onPress={onConfirm} />
      )}
      <PillButton
        variant="tertiary"
        label={t({ id: 'common.confirm.cancel', message: 'Cancel' })}
        onPress={onCancel}
        block
      />
    </Stack>
  );
}
