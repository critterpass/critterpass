/**
 * How the payee gets paid, one method per card (revealed online only, never stored): a QR for
 * PayNow, PromptPay, VietQR or DuitNow, bank details with COPY, a Wise link, or cash.
 */
/* eslint-disable lingui/no-unlocalized-strings -- field names are wire values. */
import type { RevealedPayoutMethod } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useMoneyDisplay } from '@/data/money';
import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { formatAmount } from '../format';
import type { SettleRowModel } from './model';
import { usePayoutKindLabel } from './payout-labels';
import { payoutQr } from './payout-qr';
import { PayoutQr } from './PayoutQr';

export interface PayoutMethodCardProps {
  readonly method: RevealedPayoutMethod;
  readonly row: SettleRowModel;
  readonly toName: string;
  readonly onCopy: (text: string) => void;
  readonly onOpen: (url: string) => void;
}

export function PayoutMethodCard({ method, row, toName, onCopy, onOpen }: PayoutMethodCardProps) {
  const theme = useTheme();
  const locale = useLocale();
  useMoneyDisplay();
  const { t } = useLingui();
  const kindLabel = usePayoutKindLabel();
  const label = kindLabel(method.kind);
  const qr = payoutQr(method, row.amountMinor, row.currency);
  const details = method.details as Readonly<Record<string, string | undefined>>;
  const amount = formatAmount(row.amountMinor, row.currency, locale);
  return (
    <Card testID={`money-pay-method-${method.kind}`}>
      <PrivateContent>
        <Stack gap="12">
          <Text variant="eyebrow">{upper(label, locale)}</Text>
          {qr !== null ? (
            <Stack gap="8" align="center">
              <PayoutQr
                payload={qr.payload}
                label={t({ id: 'money.pay.qrLabel', message: `${label} for ${toName}` })}
              />
              {qr.withAmount ? null : (
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {t({ id: 'money.pay.typeAmount', message: `Type ${amount} in your bank app.` })}
                </Text>
              )}
            </Stack>
          ) : method.kind === 'bank' ? (
            <SettingsGroup
              rows={(['bank_name', 'account_name', 'account_number', 'swift', 'branch'] as const)
                .filter((field) => details[field] !== undefined)
                .map((field) => ({
                  key: field,
                  kind: 'value' as const,
                  title: details[field] ?? '',
                  value: t({ id: 'money.pay.copy', message: 'Copy' }),
                  onPress: () => onCopy(details[field] ?? ''),
                }))}
            />
          ) : method.kind === 'wise_link' ? (
            <PillButton
              label={upper(t({ id: 'money.pay.openWise', message: 'Open Wise' }), locale)}
              onPress={() => onOpen(details['url'] ?? '')}
              variant="secondary"
              block
            />
          ) : (
            <Text variant="body">
              {t({ id: 'money.pay.cash', message: 'Hand it over in person.' })}
            </Text>
          )}
        </Stack>
      </PrivateContent>
    </Card>
  );
}
