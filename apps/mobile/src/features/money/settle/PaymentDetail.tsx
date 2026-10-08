/**
 * One payment (undesigned; built from the settle row, cards and settings rows). The payer sees the
 * amount, how the payee gets paid (revealed online only, never stored: a QR for PayNow, PromptPay,
 * VietQR or DuitNow, bank details with COPY, a Wise link, cash) and MARK PAID with the method and,
 * for a part payment, the amount, which reads as money in the payment's currency while it is
 * typed. The payee sees REQUEST / NUDGE / CONFIRM / DISPUTE.
 */
/* eslint-disable lingui/no-unlocalized-strings -- field names and method ids are wire values. */
import type { PaymentMethod, RevealedPayoutMethod } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useMoneyDisplay } from '@/data/money';

import { formatAmount, formatAmountShown } from '../format';
import { AmountPaidField } from './AmountPaidField';
import type { SettleRowModel } from './model';
import { useStatusLabel } from './PaymentRow';
import { usePayoutKindLabel } from './payout-labels';
import { payoutQr } from './payout-qr';
import { PayoutQr } from './PayoutQr';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  chips: { gap: t.space['8'], flexWrap: 'wrap' },
}));

export type RevealState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'ok'; readonly methods: readonly RevealedPayoutMethod[] };

export interface PaymentDetailProps {
  readonly row: SettleRowModel;
  readonly fromName: string;
  readonly toName: string;
  readonly reveal: RevealState;
  readonly method: PaymentMethod;
  /** The amount paid as keypad digits in the currency's own units ("18640" is US$186.40). */
  readonly amountDigits: string;
  readonly amountValid: boolean;
  readonly busy: boolean;
  readonly onMethod: (method: PaymentMethod) => void;
  readonly onAmount: (digits: string) => void;
  readonly onMarkPaid: () => void;
  readonly onRequest: () => void;
  readonly onNudge: () => void;
  readonly onConfirm: () => void;
  readonly onDispute: () => void;
  readonly onCopy: (text: string) => void;
  readonly onOpen: (url: string) => void;
}

type MethodProps = Pick<PaymentDetailProps, 'row' | 'toName' | 'onCopy' | 'onOpen'> & {
  readonly method: RevealedPayoutMethod;
};

function Method({ method, row, toName, onCopy, onOpen }: MethodProps) {
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

export function PaymentDetail(props: PaymentDetailProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  useMoneyDisplay();
  const { t } = useLingui();
  const statusLabel = useStatusLabel();
  const kindLabel = usePayoutKindLabel();
  const { row } = props;
  const payee = props.toName;
  const payer = props.fromName;
  const title =
    row.role === 'payer'
      ? t({ id: 'money.pay.titlePay', message: `Pay ${payee}` })
      : row.role === 'payee'
        ? t({ id: 'money.pay.titleOwed', message: `${payer} owes you` })
        : t({ id: 'money.pay.titleOther', message: `${payer} pays ${payee}` });
  const methods: PaymentMethod[] = [
    ...(props.reveal.kind === 'ok'
      ? props.reveal.methods.map((m) => (m.kind === 'wise_link' ? 'wise' : m.kind))
      : []),
    'cash',
    'other',
  ].filter((value, index, all) => all.indexOf(value) === index) as PaymentMethod[];
  return (
    <Scaffold variant="dark" testID="money-payment">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + theme.space['32'] },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <BackEyebrow label={upper(t({ id: 'money.pay.back', message: 'Settle up' }), locale)} />
        <Text variant="h1" accessibilityRole="header">
          {upper(title, locale)}
        </Text>
        <Row gap="12" align="center">
          <PrivateContent>
            <Text variant="displayXl" testID="money-payment-amount">
              {formatAmountShown(row.amountMinor, row.currency, locale)}
            </Text>
          </PrivateContent>
          <Text variant="label" color={theme.semantic.text.secondary}>
            {statusLabel(row)}
          </Text>
        </Row>
        {row.note === null ? null : (
          <Text variant="body" color={theme.semantic.state.urgent}>
            {row.note}
          </Text>
        )}
        {row.role === 'payer' && row.actions.includes('pay') ? (
          <>
            {props.reveal.kind === 'ok' ? (
              props.reveal.methods.map((method) => (
                <Method
                  key={method.method_id}
                  method={method}
                  row={row}
                  toName={payee}
                  onCopy={props.onCopy}
                  onOpen={props.onOpen}
                />
              ))
            ) : (
              <Text
                variant="body"
                color={theme.semantic.text.secondary}
                testID={`money-pay-reveal-${props.reveal.kind}`}
              >
                {props.reveal.kind === 'loading'
                  ? t({ id: 'money.pay.revealLoading', message: `Getting how ${payee} gets paid…` })
                  : props.reveal.kind === 'offline'
                    ? t({
                        id: 'money.pay.revealOffline',
                        message: `Connect to see how ${payee} gets paid. You can still mark it paid.`,
                      })
                    : t({
                        id: 'money.pay.revealNone',
                        message: `Once ${payee} requests it, their payment details show here. Cash works any time.`,
                      })}
              </Text>
            )}
            <Stack gap="8">
              <Text variant="eyebrow">
                {upper(t({ id: 'money.pay.how', message: 'How you paid' }), locale)}
              </Text>
              <Row style={styles.chips}>
                {methods.map((method) => (
                  <ChoiceChip
                    key={method}
                    label={upper(
                      method === 'other'
                        ? t({ id: 'money.pay.other', message: 'Other' })
                        : method === 'wise'
                          ? kindLabel('wise_link')
                          : kindLabel(method),
                      locale,
                    )}
                    selected={props.method === method}
                    onPress={() => props.onMethod(method)}
                    testID={`money-pay-how-${method}`}
                  />
                ))}
              </Row>
              <AmountPaidField
                digits={props.amountDigits}
                amountMinor={row.amountMinor}
                currency={row.currency}
                valid={props.amountValid}
                onDigits={props.onAmount}
              />
            </Stack>
            <PillButton
              label={upper(t({ id: 'money.pay.markPaid', message: 'Mark paid' }), locale)}
              onPress={props.onMarkPaid}
              disabled={!props.amountValid}
              loading={props.busy}
              block
              testID="money-pay-mark"
            />
          </>
        ) : null}
        {row.role === 'payer' && row.status === 'marked_paid' ? (
          <Text variant="body" color={theme.semantic.text.secondary}>
            {t({
              id: 'money.pay.waiting',
              message: `Waiting for ${payee} to confirm. It confirms itself after seven days.`,
            })}
          </Text>
        ) : null}
        {row.role === 'payee' ? (
          <Stack gap="8">
            {row.actions.includes('request') ? (
              <PillButton
                label={upper(t({ id: 'money.pay.request', message: 'Request it' }), locale)}
                onPress={props.onRequest}
                loading={props.busy}
                block
                testID="money-pay-request"
              />
            ) : null}
            {row.actions.includes('confirm') ? (
              <PillButton
                label={upper(t({ id: 'money.pay.confirm', message: 'I got it' }), locale)}
                onPress={props.onConfirm}
                loading={props.busy}
                block
                testID="money-pay-confirm"
              />
            ) : null}
            {row.actions.includes('nudge') ? (
              <PillButton
                label={upper(t({ id: 'money.pay.nudge', message: `Nudge ${payer}` }), locale)}
                onPress={props.onNudge}
                variant="secondary"
                block
                testID="money-pay-nudge"
              />
            ) : null}
            {row.actions.includes('dispute') ? (
              <PillButton
                label={upper(t({ id: 'money.pay.dispute', message: "It didn't arrive" }), locale)}
                onPress={props.onDispute}
                variant="tertiary"
                block
                testID="money-pay-dispute"
              />
            ) : null}
          </Stack>
        ) : null}
      </ScrollView>
    </Scaffold>
  );
}
