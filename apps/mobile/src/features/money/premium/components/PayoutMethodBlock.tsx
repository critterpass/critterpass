/**
 * How the payee gets paid, in the premium pay page (7.25): the QR for PayNow, PromptPay, VietQR or
 * DuitNow on a white card (light in both modes; the caption says to type the amount when the code
 * cannot carry it), bank details as rows that copy, the Wise link, or "hand it over" for cash.
 * Revealed online only and never stored.
 */
import type { RevealedPayoutMethod } from '@cp/domain';
import { premium } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { Button, PressableScale, ring, Text, usePremiumTheme } from '@/ui/premium';

import { formatAmount } from '../../format';
import type { SettleRowModel } from '../../settle/model';
import { payoutQr } from '../../settle/payout-qr';
import { qrPath } from '../../settle/qr-path';

const LIGHT = premium.modes.light.color;
const QR_SIZE = 210;

function Qr({ payload, label }: { readonly payload: string; readonly label: string }) {
  const qr = useMemo(() => qrPath(payload), [payload]);
  const inner = QR_SIZE - 24;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        styles.qr,
        { backgroundColor: LIGHT.card, boxShadow: ring(1, LIGHT.fieldBorder, true) },
      ]}
    >
      <Canvas style={{ width: inner, height: inner }}>
        <Group transform={[{ scale: inner / qr.size }]}>
          <Path path={qr.path} color={LIGHT.ink} />
        </Group>
      </Canvas>
    </View>
  );
}

// eslint-disable-next-line lingui/no-unlocalized-strings -- wire field names, not copy
const BANK_FIELDS = ['bank_name', 'account_name', 'account_number', 'swift', 'branch'] as const;

export function PayoutMethodBlock(props: {
  readonly method: RevealedPayoutMethod;
  readonly row: SettleRowModel;
  readonly label: string;
  readonly toName: string;
  readonly onCopy: (text: string) => void;
  readonly onOpen: (url: string) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const { method, row, label, toName } = props;
  const qr = payoutQr(method, row.amountMinor, row.currency);
  const details = method.details as Readonly<Record<string, string | undefined>>;
  const amount = formatAmount(row.amountMinor, row.currency, locale);
  return (
    <PrivateContent>
      {qr !== null ? (
        <View
          style={[
            styles.qrCard,
            {
              borderRadius: th.radius.hero,
              backgroundColor: LIGHT.card,
              boxShadow: th.shadow.photo,
            },
          ]}
          testID={`money-pay-method-${method.kind}`}
        >
          <Qr
            payload={qr.payload}
            label={t({ id: 'money.pay.qrLabel', message: `${label} for ${toName}` })}
          />
          <Text variant="caption" color={LIGHT.inkSecondary} align="center">
            {qr.withAmount
              ? t({ id: 'money.premium.scanQr', message: 'Scan in your bank app.' })
              : t({ id: 'money.pay.typeAmount', message: `Type ${amount} in your bank app.` })}
          </Text>
        </View>
      ) : method.kind === 'bank' ? (
        <View
          style={[
            styles.bank,
            {
              marginHorizontal: th.space.gutter,
              borderRadius: th.radius.cardRow,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.card,
            },
          ]}
          testID={`money-pay-method-${method.kind}`}
        >
          {BANK_FIELDS.filter((field) => details[field] !== undefined).map((field, index) => (
            <PressableScale
              key={field}
              onPress={() => props.onCopy(details[field] ?? '')}
              pressedScale={0.99}
              accessibilityRole="button"
              accessibilityHint={t({ id: 'money.premium.copyHint', message: 'Copies it' })}
              testID={`money-pay-copy-${field}`}
            >
              <View
                style={[
                  styles.bankRow,
                  index === 0 ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
                ]}
              >
                <Text variant="headline" style={styles.flex} numberOfLines={1}>
                  {details[field] ?? ''}
                </Text>
                <Text variant="pillSmall" tone="muted">
                  {t({ id: 'money.pay.copy', message: 'Copy' })}
                </Text>
              </View>
            </PressableScale>
          ))}
        </View>
      ) : method.kind === 'wise_link' ? (
        <View style={{ paddingHorizontal: th.space.gutter }}>
          <Button
            label={t({ id: 'money.pay.openWise', message: 'Open Wise' })}
            variant="secondary"
            onPress={() => props.onOpen(details['url'] ?? '')}
            testID="money-pay-wise"
          />
        </View>
      ) : (
        <Text variant="body" tone="muted" align="center">
          {t({ id: 'money.pay.cash', message: 'Hand it over in person.' })}
        </Text>
      )}
    </PrivateContent>
  );
}

const styles = StyleSheet.create({
  qrCard: { alignSelf: 'center', alignItems: 'center', gap: 10, padding: 14 },
  qr: {
    width: QR_SIZE,
    height: QR_SIZE,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bank: { overflow: 'hidden' },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 16,
  },
  flex: { flex: 1, minWidth: 0 },
});
