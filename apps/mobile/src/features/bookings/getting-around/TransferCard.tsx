/**
 * A pre-booked transfer from the wallet (3h-3, truthful): who it is booked with, from the traveller's
 * own email, and the driver details only as the voucher printed them.
 */
import { useLingui } from '@lingui/react/macro';

import { TextLink } from '@/ui/buttons/TextLink';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { TransferBooking } from './model';

export interface TransferCardProps {
  readonly transfer: TransferBooking;
  /** The copy-rule line: "Airport pickup booked on Klook (from your email) · …". */
  readonly line: string;
  readonly when: string | null;
  readonly onOpen: () => void;
}

export function TransferCard({ transfer, line, when, onOpen }: TransferCardProps) {
  const theme = useTheme();
  const { t } = useLingui();
  const operator = transfer.operator;
  const meeting = transfer.meetingPoint;
  return (
    <Stack gap="8" testID="getting-around-transfer">
      <Row gap="12" align="center">
        <Icon name="car" size={36} decorative />
        <Stack gap="2" style={{ flex: 1 }}>
          <Text variant="title">{transfer.title}</Text>
          {when ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {when}
            </Text>
          ) : null}
        </Stack>
      </Row>
      <Text variant="bodySm">{line}</Text>
      {operator ? (
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'suppliers.transfer.operator',
            message: `Operator on the voucher: ${operator}`,
          })}
        </Text>
      ) : null}
      {meeting ? (
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({ id: 'suppliers.transfer.meeting', message: `Meet at: ${meeting}` })}
        </Text>
      ) : null}
      <TextLink
        label={t({ id: 'suppliers.transfer.open', message: 'Open the voucher' })}
        onPress={onOpen}
        testID="getting-around-transfer-open"
      />
    </Stack>
  );
}
