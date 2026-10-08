/**
 * One payment (undesigned; built from the settle row, cards and settings rows). The payer sees the
 * amount, how the payee gets paid (revealed online only, never stored: a QR for PayNow, PromptPay,
 * VietQR or DuitNow, bank details with COPY, a Wise link, cash) and MARK PAID with the method and,
 * for a part payment, the amount, which reads as money in the payment's currency while it is
 * typed; MARK PAID stays in a footer above the keyboard. The payee sees REQUEST / NUDGE / CONFIRM /
 * DISPUTE, each held while an answer is on its way.
 */
/* eslint-disable lingui/no-unlocalized-strings -- field names and method ids are wire values. */
import type { PaymentMethod, RevealedPayoutMethod } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { AmountField } from '@/ui/inputs/AmountField';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Amount } from '@/ui/money/Amount';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useMoneyDisplay } from '@/data/money';
import { amountText } from '@/data/money/amount-digits';

import { formatAmountShown } from '../format';
import { amountPaidDigits } from './amount-paid';
import type { SettleRowModel } from './model';
import { useStatusLabel } from './PaymentRow';
import { usePayoutKindLabel } from './payout-labels';
import { PayoutMethodCard } from './PayoutMethodCard';
import { MONEY_ROUTES } from '../routes';

const useStyles = makeStyles((t) => ({
  content: {
    paddingHorizontal: t.size.gutter,
    gap: t.space['16'],
    paddingTop: t.space['8'],
    paddingBottom: t.space['32'],
  },
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

export function PaymentDetail(props: PaymentDetailProps) {
  const styles = useStyles();
  const theme = useTheme();
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
  const paying = row.role === 'payer' && row.actions.includes('pay');
  return (
    <Scaffold variant="dark" testID="money-payment">
      <KeyboardScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <BackEyebrow
          label={upper(t({ id: 'money.pay.back', message: 'Settle up' }), locale)}
          fallback={MONEY_ROUTES.settle}
        />
        <Text variant="h1" accessibilityRole="header">
          {upper(title, locale)}
        </Text>
        <Row gap="12" align="center">
          <PrivateContent>
            <Amount variant="displayXl" testID="money-payment-amount">
              {formatAmountShown(row.amountMinor, row.currency, locale)}
            </Amount>
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
        {paying ? (
          <>
            {props.reveal.kind === 'ok' ? (
              props.reveal.methods.map((method) => (
                <PayoutMethodCard
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
              <AmountField
                label={t({ id: 'money.pay.amount', message: 'Amount paid' })}
                digits={props.amountDigits}
                shown={amountText(props.amountDigits, row.currency, locale)}
                placeholder={amountText('0', row.currency, locale)}
                onDigits={props.onAmount}
                maxDigits={amountPaidDigits(row.amountMinor, row.currency).length}
                {...(props.amountValid ? {} : { status: 'error' as const })}
                message={t({
                  id: 'money.pay.amountHint',
                  message: 'Paying part of it? The rest stays open.',
                })}
                testID="money-pay-amount"
              />
            </Stack>
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
                disabled={props.busy}
                block
                testID="money-pay-nudge"
              />
            ) : null}
            {row.actions.includes('dispute') ? (
              <PillButton
                label={upper(t({ id: 'money.pay.dispute', message: "It didn't arrive" }), locale)}
                onPress={props.onDispute}
                variant="tertiary"
                disabled={props.busy}
                block
                testID="money-pay-dispute"
              />
            ) : null}
          </Stack>
        ) : null}
      </KeyboardScrollView>
      {paying ? (
        <KeyboardFooter>
          <PillButton
            label={upper(t({ id: 'money.pay.markPaid', message: 'Mark paid' }), locale)}
            onPress={props.onMarkPaid}
            disabled={!props.amountValid}
            loading={props.busy}
            block
            testID="money-pay-mark"
          />
        </KeyboardFooter>
      ) : null}
    </Scaffold>
  );
}
