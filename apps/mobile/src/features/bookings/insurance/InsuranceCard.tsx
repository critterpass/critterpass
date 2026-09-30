/**
 * The travel-insurance card under the stack ("Chubb Travel · policy card"; undesigned, a paper
 * card in the ticket type scale): provider, policy number and the assistance line with CALL, all
 * from the owner's own copy on the phone. Without a policy, a dashed "Add travel insurance".
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { DashedAddCard } from '@/ui/cards/DashedAddCard';
import { DocField } from '@/ui/documents/DocField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';

import type { InsurancePolicy } from './insurance-data';

export interface InsuranceCardProps {
  readonly policy: InsurancePolicy | null;
  readonly onOpen: () => void;
  readonly onCall: (phone: string) => void;
}

export function InsuranceCard({ policy, onOpen, onCall }: InsuranceCardProps) {
  const locale = useLocale();
  const { t } = useLingui();
  if (policy === null) {
    return (
      <DashedAddCard
        label={t({ id: 'bookings.insurance.add', message: 'Add travel insurance' })}
        onPress={onOpen}
        testID="bookings-insurance-add"
      />
    );
  }
  const phone = policy.assistance_phone;
  return (
    <Card
      tone="paper"
      onPress={onOpen}
      accessibilityLabel={t({
        id: 'bookings.insurance.cardA11y',
        message: `Travel insurance, ${policy.provider}, policy card`,
      })}
      testID="bookings-insurance-card"
    >
      <Stack gap="10">
        <Text variant="eyebrow">
          {upper(t({ id: 'bookings.insurance.eyebrow', message: 'Travel insurance' }), locale)}
        </Text>
        <Text variant="h3">{policy.provider}</Text>
        <Row gap="16" align="flex-end">
          <DocField
            flex={1}
            label={upper(t({ id: 'bookings.insurance.policyNo', message: 'Policy no.' }), locale)}
            value={policy.policy_no}
          />
          {phone === null ? null : (
            <DocField
              flex={1}
              label={upper(t({ id: 'bookings.insurance.phone', message: 'Assistance' }), locale)}
              value={phone}
            />
          )}
        </Row>
        {phone === null ? null : (
          <PillButton
            label={t({ id: 'bookings.insurance.call', message: 'Call assistance' })}
            onPress={() => onCall(phone)}
            tone="ink"
            size="sm"
            block={false}
            testID="bookings-insurance-call"
          />
        )}
      </Stack>
    </Card>
  );
}
